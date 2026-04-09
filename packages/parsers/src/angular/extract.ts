import ts from 'typescript';

import type { AngularHttpCallArtifact } from '@drift/shared';

import { createTypeShapeResolver } from '../typescript/shape-resolver.js';

const ANGULAR_HTTP_METHOD_NAMES = {
  delete: 'DELETE',
  get: 'GET',
  head: 'HEAD',
  options: 'OPTIONS',
  patch: 'PATCH',
  post: 'POST',
  put: 'PUT',
} as const;

type AngularHttpMethodName = keyof typeof ANGULAR_HTTP_METHOD_NAMES;

type SourceFileInput = {
  filePath: string;
  content: string;
};

export function extractAngularHttpArtifactsFromTypeScriptFile(
  input: SourceFileInput,
): AngularHttpCallArtifact[] {
  const sourceFile = ts.createSourceFile(
    input.filePath,
    input.content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const shapeResolver = createTypeShapeResolver(sourceFile);
  const httpClientTypeNames = collectHttpClientTypeNames(sourceFile);

  if (httpClientTypeNames.size === 0) {
    return [];
  }

  const artifacts: AngularHttpCallArtifact[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement) || !statement.name) {
      continue;
    }

    const className = statement.name.text;
    const httpClientNames = collectHttpClientNames(statement, httpClientTypeNames, sourceFile);

    if (httpClientNames.size === 0) {
      continue;
    }

    for (const member of statement.members) {
      if (!ts.isMethodDeclaration(member) && !ts.isPropertyDeclaration(member)) {
        continue;
      }

      const memberName = readClassMemberName(member.name, sourceFile);

      if (!memberName) {
        continue;
      }

      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node)) {
          const artifact = tryCreateHttpArtifact({
            node,
            className,
            filePath: input.filePath,
            httpClientNames,
            memberName,
            member,
            shapeResolver,
            sourceFile,
          });

          if (artifact) {
            artifacts.push(artifact);
          }
        }

        ts.forEachChild(node, visit);
      };

      if (ts.isMethodDeclaration(member) && member.body) {
        visit(member.body);
      }

      if (ts.isPropertyDeclaration(member) && member.initializer) {
        visit(member.initializer);
      }
    }
  }

  return artifacts;
}

function collectHttpClientTypeNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause?.namedBindings) {
      continue;
    }

    if (
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== '@angular/common/http' ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }

    for (const element of statement.importClause.namedBindings.elements) {
      if (element.propertyName?.text === 'HttpClient' || element.name.text === 'HttpClient') {
        names.add(element.name.text);
      }
    }
  }

  return names;
}

function collectHttpClientNames(
  classDeclaration: ts.ClassDeclaration,
  httpClientTypeNames: Set<string>,
  sourceFile: ts.SourceFile,
): Set<string> {
  const names = new Set<string>();

  for (const member of classDeclaration.members) {
    if (ts.isConstructorDeclaration(member)) {
      for (const parameter of member.parameters) {
        if (!parameter.type || !ts.isTypeReferenceNode(parameter.type)) {
          continue;
        }

        if (!ts.isIdentifier(parameter.type.typeName)) {
          continue;
        }

        if (!httpClientTypeNames.has(parameter.type.typeName.text)) {
          continue;
        }

        names.add(parameter.name.getText(sourceFile));
      }
    }

    if (ts.isPropertyDeclaration(member) && member.name) {
      const propertyName = readClassMemberName(member.name, sourceFile);

      if (!propertyName) {
        continue;
      }

      if (
        member.type &&
        ts.isTypeReferenceNode(member.type) &&
        ts.isIdentifier(member.type.typeName) &&
        httpClientTypeNames.has(member.type.typeName.text)
      ) {
        names.add(propertyName);
      }

      if (isInjectHttpClientInitializer(member.initializer, httpClientTypeNames)) {
        names.add(propertyName);
      }
    }
  }

  return names;
}

function isInjectHttpClientInitializer(
  initializer: ts.Expression | undefined,
  httpClientTypeNames: Set<string>,
): boolean {
  if (!initializer || !ts.isCallExpression(initializer)) {
    return false;
  }

  if (!ts.isIdentifier(initializer.expression) || initializer.expression.text !== 'inject') {
    return false;
  }

  const [firstArgument] = initializer.arguments;

  return !!firstArgument && ts.isIdentifier(firstArgument) && httpClientTypeNames.has(firstArgument.text);
}

function tryCreateHttpArtifact(params: {
  node: ts.CallExpression;
  className: string;
  filePath: string;
  httpClientNames: Set<string>;
  memberName: string;
  member: ts.MethodDeclaration | ts.PropertyDeclaration;
  shapeResolver: ReturnType<typeof createTypeShapeResolver>;
  sourceFile: ts.SourceFile;
}): AngularHttpCallArtifact | null {
  const { node, className, filePath, httpClientNames, member, memberName, shapeResolver, sourceFile } =
    params;

  if (!ts.isPropertyAccessExpression(node.expression)) {
    return null;
  }

  const methodName = node.expression.name.text;

  if (!isAngularHttpMethodName(methodName)) {
    return null;
  }

  const httpClientName = readHttpClientReceiverName(node.expression.expression);

  if (!httpClientName || !httpClientNames.has(httpClientName)) {
    return null;
  }

  const [urlArgument] = node.arguments;

  if (!urlArgument) {
    return null;
  }

  const urlExpression = urlArgument.getText(sourceFile);
  const normalizedPath = normalizeAngularUrl(urlArgument);
  const payloadShape = extractPayloadShape(node, member, shapeResolver, sourceFile, methodName);
  const responseType = node.typeArguments?.[0]?.getText(sourceFile) ?? null;
  const responseShape = shapeResolver.resolveTypeNode(node.typeArguments?.[0]);
  const method = ANGULAR_HTTP_METHOD_NAMES[methodName];

  return {
    id: `angular_http_call:${filePath}:${className}:${memberName}:${method}:${urlExpression}`,
    kind: 'angular_http_call',
    source: 'angular',
    file: filePath,
    line: toLineNumber(sourceFile, node),
    className,
    memberName,
    method,
    httpClientName,
    urlExpression,
    normalizedPath,
    payloadShape,
    responseType,
    responseShape,
  };
}

function extractPayloadShape(
  node: ts.CallExpression,
  member: ts.MethodDeclaration | ts.PropertyDeclaration,
  shapeResolver: ReturnType<typeof createTypeShapeResolver>,
  sourceFile: ts.SourceFile,
  methodName: AngularHttpMethodName,
): string[] | null {
  if (!['post', 'put', 'patch'].includes(methodName)) {
    return null;
  }

  const payloadArgument = node.arguments[1];

  if (!payloadArgument) {
    return null;
  }

  const expressionShape = shapeResolver.resolveExpressionShape(payloadArgument);

  if (expressionShape) {
    return expressionShape;
  }

  if (ts.isIdentifier(payloadArgument) && ts.isMethodDeclaration(member)) {
    for (const parameter of member.parameters) {
      if (!ts.isIdentifier(parameter.name) || parameter.name.text !== payloadArgument.text) {
        continue;
      }

      return shapeResolver.resolveTypeNode(parameter.type);
    }
  }

  return payloadArgument.getText(sourceFile).startsWith('{')
    ? shapeResolver.resolveExpressionShape(payloadArgument)
    : null;
}

function readHttpClientReceiverName(expression: ts.Expression): string | null {
  if (ts.isPropertyAccessExpression(expression) && expression.expression.kind === ts.SyntaxKind.ThisKeyword) {
    return expression.name.text;
  }

  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  return null;
}

function normalizeAngularUrl(expression: ts.Expression): string | null {
  if (ts.isStringLiteralLike(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }

  return null;
}

function readClassMemberName(name: ts.PropertyName | ts.PrivateIdentifier, sourceFile: ts.SourceFile): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  if (ts.isPrivateIdentifier(name)) {
    return name.text;
  }

  if (ts.isComputedPropertyName(name)) {
    return name.expression.getText(sourceFile);
  }

  return null;
}

function isAngularHttpMethodName(value: string): value is AngularHttpMethodName {
  return value in ANGULAR_HTTP_METHOD_NAMES;
}

function toLineNumber(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}
