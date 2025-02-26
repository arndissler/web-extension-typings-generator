import { ReferenceType, TypeGeneratorContext } from "./types";
import { isWithId, isWithName } from "./guards";
import { addJsDocAnnotation } from "../utils";
import ts from "typescript";

export const generateReferenceType = (
  type: ReferenceType,
  ctx: TypeGeneratorContext
) => {
  const { currentNamespace, knownTypes, schemaCatalog, context, factory } = ctx;

  const referenceLink = type.$ref.split(".");
  if (referenceLink.length === 1) {
    // if it's a reference to a type in the same namespace we need to check whether it exists or not
    const localType = schemaCatalog[currentNamespace].types.find(
      (someType) => isWithId(someType) && someType.id === type.$ref
    );
    const manifestType = schemaCatalog["manifest"].types.find(
      (someType) => isWithId(someType) && someType.id === type.$ref
    );

    if (localType === undefined && manifestType !== undefined) {
      console.warn(
        `Warning: schema incorrect, referenced local type: ${type.$ref} in '${currentNamespace}', but should reference manifest.${type.$ref}`
      );
      type.$ref = `manifest.${type.$ref}`;
    }
  }

  const referenceType = factory.createTypeReferenceNode(type.$ref);

  if (context === "inline") {
    return referenceType;
  } else if (context === "namespace") {
    const identifier = isWithName(type) ? type.name : type.id;
    return factory.createVariableStatement(
      [factory.createToken(ts.SyntaxKind.ExportKeyword)],
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            factory.createIdentifier(identifier),
            undefined,
            referenceType,
            undefined
          ),
        ],
        ts.NodeFlags.Const
      )
    );
  } else if (context === "interface") {
    const identifier = isWithName(type) ? type.name : type.id;
    return addJsDocAnnotation(
      type,
      factory.createPropertySignature(
        undefined,
        factory.createIdentifier(identifier),
        undefined,
        referenceType
      )
    );
  }

  throw new Error("Invalid type generator context");
};
