import { StringType, TypeGeneratorContext } from "./types";
import { isEnumStringType } from "./guards";
import ts from "typescript";
import { addJsDocAnnotation } from "../utils";

export const generateStringType = (
  type: StringType,
  ctx: TypeGeneratorContext
) => {
  const { currentNamespace, knownTypes, schemaCatalog, context, factory } = ctx;

  // string enum type creates a string literal union type
  if (isEnumStringType(type)) {
    const _type = factory.createUnionTypeNode(
      type.enum.map((value) =>
        factory.createLiteralTypeNode(factory.createStringLiteral(value))
      )
    );

    if (context === "inline") {
      return _type;
    }

    if (context === "namespace" || context === "interface") {
      return addJsDocAnnotation(
        type,
        factory.createTypeAliasDeclaration(
          [factory.createToken(ts.SyntaxKind.ExportKeyword)],
          factory.createIdentifier(type.id),
          undefined,
          _type
        )
      );
    }

    throw new Error("Invalid type generator context");
  }

  // simple string type, just use `string` keyword
  if (context === "inline") {
    // if it's an inline type, return the type directly
    return factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
  }

  if (context === "namespace" || context === "interface") {
    // if it's not an inline type, create a type alias
    return addJsDocAnnotation(
      type,
      factory.createTypeAliasDeclaration(
        [factory.createToken(ts.SyntaxKind.ExportKeyword)],
        factory.createIdentifier(type.id),
        undefined,
        factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)
      )
    );
  }

  throw new Error("Invalid type generator context");
};
