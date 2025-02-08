import ts from "typescript";
import { StaticValueType, TypeGeneratorContext } from "./types";
import { isWithId, isWithName } from "./guards";

const createLiteralNode = (
  value: string | number | boolean,
  factory: ts.NodeFactory
) => {
  if (typeof value === "string") {
    return factory.createLiteralTypeNode(factory.createStringLiteral(value));
  } else if (typeof value === "number") {
    if (value >= 0) {
      return factory.createLiteralTypeNode(
        factory.createNumericLiteral(value.toString(10))
      );
    } else {
      return factory.createLiteralTypeNode(
        factory.createPrefixUnaryExpression(
          ts.SyntaxKind.MinusToken,
          factory.createNumericLiteral(Math.abs(value).toString(10))
        )
      );
    }
  } else if (typeof value === "boolean") {
    return factory.createLiteralTypeNode(
      value ? factory.createTrue() : factory.createFalse()
    );
  }

  return null;
};

export const generateStaticValueType = (
  type: StaticValueType,
  ctx: TypeGeneratorContext
) => {
  const { currentNamespace, knownTypes, schemaCatalog, context, factory } = ctx;
  const value = type.value;
  const valueNode = createLiteralNode(value, factory);
  const name = isWithName(type) ? type.name : isWithId(type) ? type.id : null;

  if (valueNode === null) {
    throw new Error(`Invalid static value type: '${value}'`);
  }

  if (name === null) {
    throw new Error(`Static value type has no name or id: '${value}'`);
  }

  if (context === "inline") {
    return factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);
  } else if (context === "namespace") {
    return factory.createVariableStatement(
      [factory.createToken(ts.SyntaxKind.ExportKeyword)],
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            factory.createIdentifier(name),
            undefined,
            valueNode,
            undefined
          ),
        ],
        ts.NodeFlags.Const
      )
    );
  } else if (context === "interface") {
    return factory.createPropertySignature(
      undefined,
      factory.createIdentifier("foobarbaz"),
      undefined,
      factory.createLiteralTypeNode(
        factory.createPrefixUnaryExpression(
          ts.SyntaxKind.MinusToken,
          factory.createNumericLiteral("2")
        )
      )
    );
  }

  throw new Error("Invalid type generator context");
};
