import ts from "typescript";
import { TypeGeneratorContext, UnionType } from "./types";
import { addJsDocAnnotation } from "../utils";
import { createSingleTyping } from "./index";

export const generateUnionType = (
  type: UnionType,
  ctx: TypeGeneratorContext
) => {
  const { currentNamespace, knownTypes, schemaCatalog, context, factory } = ctx;

  const _type = factory.createUnionTypeNode(
    type.choices.map(
      // TODO: remove ugly type assertion
      (choice) =>
        createSingleTyping(choice, {
          currentNamespace,
          knownTypes,
          schemaCatalog,
          factory,
          context: "inline",
        })! as ts.TypeNode
    )
  );

  if (context === "inline") {
    return _type;
  }

  if (context === "namespace" || context === "interface") {
    return addJsDocAnnotation(
      type,
      factory.createTypeAliasDeclaration(
        undefined,
        factory.createIdentifier(type.id),
        undefined,
        _type
      )
    );
  }

  throw new Error("Invalid type generator context");
};
