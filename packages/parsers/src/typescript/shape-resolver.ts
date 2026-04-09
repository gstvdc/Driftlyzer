import ts from 'typescript';

const WRAPPER_TYPE_NAMES = new Set([
  'Array',
  'Promise',
  'Observable',
  'ReadonlyArray',
  'Partial',
  'Required',
  'Readonly',
]);

type TypeDeclaration = ts.InterfaceDeclaration | ts.TypeAliasDeclaration;

export type TypeShapeResolver = {
  resolveTypeNode: (typeNode: ts.TypeNode | undefined) => string[] | null;
  resolveExpressionShape: (expression: ts.Expression | undefined) => string[] | null;
  resolveIdentifierShape: (identifierName: string) => string[] | null;
};

export function createTypeShapeResolver(sourceFile: ts.SourceFile): TypeShapeResolver {
  const typeDeclarations = collectTypeDeclarations(sourceFile);

  return {
    resolveTypeNode: (typeNode: ts.TypeNode | undefined) =>
      resolveTypeNode(typeNode, sourceFile, typeDeclarations, new Set()),
    resolveExpressionShape: (expression: ts.Expression | undefined) =>
      resolveExpressionShape(expression, sourceFile, typeDeclarations, new Set()),
    resolveIdentifierShape: (identifierName: string) =>
      resolveIdentifierShape(identifierName, sourceFile, typeDeclarations, new Set()),
  };
}

function collectTypeDeclarations(sourceFile: ts.SourceFile): Map<string, TypeDeclaration> {
  const declarations = new Map<string, TypeDeclaration>();

  for (const statement of sourceFile.statements) {
    if ((ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) && statement.name) {
      declarations.set(statement.name.text, statement);
    }
  }

  return declarations;
}

function resolveExpressionShape(
  expression: ts.Expression | undefined,
  sourceFile: ts.SourceFile,
  declarations: Map<string, TypeDeclaration>,
  seen: Set<string>,
): string[] | null {
  if (!expression) {
    return null;
  }

  if (ts.isObjectLiteralExpression(expression)) {
    return normalizeShape(
      expression.properties.flatMap((property) => {
        if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
          return getPropertyName(property.name) ? [getPropertyName(property.name)!] : [];
        }

        return [];
      }),
    );
  }

  if (ts.isIdentifier(expression)) {
    return resolveIdentifierShape(expression.text, sourceFile, declarations, seen);
  }

  return null;
}

function resolveIdentifierShape(
  identifierName: string,
  sourceFile: ts.SourceFile,
  declarations: Map<string, TypeDeclaration>,
  seen: Set<string>,
): string[] | null {
  const declaration = declarations.get(identifierName);

  if (declaration) {
    return resolveDeclarationShape(declaration, sourceFile, declarations, seen);
  }

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declarationItem of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declarationItem.name) || declarationItem.name.text !== identifierName) {
        continue;
      }

      return (
        resolveTypeNode(declarationItem.type, sourceFile, declarations, seen) ??
        resolveExpressionShape(declarationItem.initializer, sourceFile, declarations, seen)
      );
    }
  }

  return null;
}

function resolveDeclarationShape(
  declaration: TypeDeclaration,
  sourceFile: ts.SourceFile,
  declarations: Map<string, TypeDeclaration>,
  seen: Set<string>,
): string[] | null {
  const declarationName = declaration.name.text;

  if (seen.has(declarationName)) {
    return null;
  }

  seen.add(declarationName);

  const shape = ts.isInterfaceDeclaration(declaration)
    ? normalizeShape(
        declaration.members.flatMap((member) => {
          if (!ts.isPropertySignature(member) || !member.name) {
            return [];
          }

          const propertyName = getPropertyName(member.name);

          return propertyName ? [propertyName] : [];
        }),
      )
    : resolveTypeNode(declaration.type, sourceFile, declarations, seen);

  seen.delete(declarationName);
  return shape;
}

function resolveTypeNode(
  typeNode: ts.TypeNode | undefined,
  sourceFile: ts.SourceFile,
  declarations: Map<string, TypeDeclaration>,
  seen: Set<string>,
): string[] | null {
  if (!typeNode) {
    return null;
  }

  if (ts.isTypeLiteralNode(typeNode)) {
    return normalizeShape(
      typeNode.members.flatMap((member) => {
        if (!ts.isPropertySignature(member) || !member.name) {
          return [];
        }

        const propertyName = getPropertyName(member.name);

        return propertyName ? [propertyName] : [];
      }),
    );
  }

  if (ts.isParenthesizedTypeNode(typeNode) || ts.isTypeOperatorNode(typeNode)) {
    return resolveTypeNode(typeNode.type, sourceFile, declarations, seen);
  }

  if (ts.isArrayTypeNode(typeNode)) {
    return resolveTypeNode(typeNode.elementType, sourceFile, declarations, seen);
  }

  if (ts.isUnionTypeNode(typeNode) || ts.isIntersectionTypeNode(typeNode)) {
    const shapes = typeNode.types
      .map((item) => resolveTypeNode(item, sourceFile, declarations, seen))
      .filter((shape): shape is string[] => Array.isArray(shape));

    return normalizeShape(shapes.flat());
  }

  if (ts.isTypeReferenceNode(typeNode)) {
    const referenceName = readTypeReferenceName(typeNode.typeName);

    if (!referenceName) {
      return null;
    }

    if (WRAPPER_TYPE_NAMES.has(referenceName)) {
      return resolveTypeNode(typeNode.typeArguments?.[0], sourceFile, declarations, seen);
    }

    if (referenceName === 'Record') {
      return null;
    }

    const declaration = declarations.get(referenceName);

    if (declaration) {
      return resolveDeclarationShape(declaration, sourceFile, declarations, seen);
    }
  }

  return null;
}

function readTypeReferenceName(typeName: ts.EntityName): string | null {
  if (ts.isIdentifier(typeName)) {
    return typeName.text;
  }

  return typeName.right.text;
}

function getPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return null;
}

function normalizeShape(properties: string[]): string[] | null {
  const values = [...new Set(properties.map((property) => property.trim()).filter(Boolean))].sort();

  return values.length > 0 ? values : null;
}
