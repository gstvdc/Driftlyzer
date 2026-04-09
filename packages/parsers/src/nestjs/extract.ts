import ts from 'typescript';

import type {
  HttpMethod,
  NestControllerArtifact,
  NestEndpointArtifact,
  RepositoryArtifact,
} from '@drift/shared';

const HTTP_DECORATOR_NAMES: Record<string, HttpMethod> = {
  Get: 'GET',
  Post: 'POST',
  Put: 'PUT',
  Patch: 'PATCH',
  Delete: 'DELETE',
  Options: 'OPTIONS',
  Head: 'HEAD',
  All: 'ALL',
};

const PARAMETER_DECORATOR_PRIORITY = ['Body', 'Query', 'Param'] as const;

export type SourceFileInput = {
  filePath: string;
  content: string;
};

export function extractNestArtifactsFromTypeScriptFile(input: SourceFileInput): RepositoryArtifact[] {
  const sourceFile = ts.createSourceFile(
    input.filePath,
    input.content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const artifacts: RepositoryArtifact[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement)) {
      continue;
    }

    const controllerDecorator = getDecoratorByName(statement, 'Controller');

    if (!controllerDecorator) {
      continue;
    }

    const className = statement.name?.text ?? 'AnonymousController';
    const basePath = readDecoratorPath(controllerDecorator, sourceFile);
    const controllerId = `nestjs_controller:${input.filePath}:${className}`;
    const controllerArtifact: NestControllerArtifact = {
      id: controllerId,
      kind: 'nestjs_controller',
      source: 'nestjs',
      file: input.filePath,
      line: toLineNumber(sourceFile, statement),
      className,
      basePath,
    };

    artifacts.push(controllerArtifact);

    for (const member of statement.members) {
      if (!ts.isMethodDeclaration(member)) {
        continue;
      }

      const routeDecorator = getRouteDecorator(member);

      if (!routeDecorator) {
        continue;
      }

      const decoratorName = getDecoratorName(routeDecorator);

      if (!decoratorName) {
        continue;
      }

      const method = HTTP_DECORATOR_NAMES[decoratorName];
      const routePath = readDecoratorPath(routeDecorator, sourceFile);
      const handlerName = member.name.getText(sourceFile);
      const endpointArtifact: NestEndpointArtifact = {
        id: `nestjs_endpoint:${input.filePath}:${className}:${handlerName}:${method}:${joinRoute(basePath, routePath)}`,
        kind: 'nestjs_endpoint',
        source: 'nestjs',
        file: input.filePath,
        line: toLineNumber(sourceFile, member),
        controllerId,
        controllerName: className,
        method,
        path: routePath,
        fullPath: joinRoute(basePath, routePath),
        handlerName,
        requestDto: extractRequestDto(member, sourceFile),
        responseType: member.type?.getText(sourceFile) ?? null,
      };

      artifacts.push(endpointArtifact);
    }
  }

  return artifacts;
}

function extractRequestDto(
  method: ts.MethodDeclaration,
  sourceFile: ts.SourceFile,
): string | null {
  for (const decoratorName of PARAMETER_DECORATOR_PRIORITY) {
    for (const parameter of method.parameters) {
      if (!hasDecoratorNamed(parameter, decoratorName)) {
        continue;
      }

      return parameter.type?.getText(sourceFile) ?? null;
    }
  }

  return null;
}

function getRouteDecorator(node: ts.Node): ts.Decorator | undefined {
  return getDecorators(node).find((decorator) => {
    const name = getDecoratorName(decorator);

    return typeof name === 'string' && name in HTTP_DECORATOR_NAMES;
  });
}

function getDecoratorByName(node: ts.Node, name: string): ts.Decorator | undefined {
  return getDecorators(node).find((decorator) => getDecoratorName(decorator) === name);
}

function hasDecoratorNamed(node: ts.Node, name: string): boolean {
  return getDecorators(node).some((decorator) => getDecoratorName(decorator) === name);
}

function getDecorators(node: ts.Node): readonly ts.Decorator[] {
  if (!ts.canHaveDecorators(node)) {
    return [];
  }

  return ts.getDecorators(node) ?? [];
}

function getDecoratorName(decorator: ts.Decorator): string | null {
  if (ts.isCallExpression(decorator.expression)) {
    return readExpressionName(decorator.expression.expression);
  }

  return readExpressionName(decorator.expression);
}

function readExpressionName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }

  return null;
}

function readDecoratorPath(decorator: ts.Decorator, sourceFile: ts.SourceFile): string {
  if (!ts.isCallExpression(decorator.expression)) {
    return '';
  }

  const [firstArgument] = decorator.expression.arguments;

  if (!firstArgument) {
    return '';
  }

  return normalizeRouteFragment(readRouteValue(firstArgument, sourceFile) ?? '');
}

function readRouteValue(expression: ts.Expression, sourceFile: ts.SourceFile): string | null {
  if (ts.isStringLiteralLike(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }

  if (ts.isObjectLiteralExpression(expression)) {
    for (const property of expression.properties) {
      if (!ts.isPropertyAssignment(property)) {
        continue;
      }

      const propertyName = getPropertyName(property.name);

      if (propertyName !== 'path') {
        continue;
      }

      return readRouteValue(property.initializer, sourceFile);
    }
  }

  if (ts.isArrayLiteralExpression(expression)) {
    const routeValues = expression.elements
      .map((element) => readRouteValue(element, sourceFile))
      .filter((value): value is string => typeof value === 'string' && value.length > 0);

    return routeValues[0] ?? null;
  }

  return expression.getText(sourceFile);
}

function getPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return null;
}

function normalizeRouteFragment(value: string): string {
  const trimmed = value.trim();

  if (!trimmed || trimmed === '/') {
    return '';
  }

  return trimmed.replace(/^\/+|\/+$/g, '');
}

function joinRoute(basePath: string, routePath: string): string {
  const segments = [basePath, routePath].filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return '/';
  }

  return `/${segments.join('/')}`;
}

function toLineNumber(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}
