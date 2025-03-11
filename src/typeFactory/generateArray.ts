/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import ts from "typescript";
import { ArrayType, TypeGeneratorContext } from "./types";
import { addJsDocAnnotation } from "../utils";
import { createSingleTyping } from "./index";

export const generateArrayType = (
  type: ArrayType,
  ctx: TypeGeneratorContext
) => {
  const { currentNamespace, knownTypes, schemaCatalog, context, factory } = ctx;

  const itemOfType = factory.createArrayTypeNode(
    createSingleTyping(type.items, {
      currentNamespace,
      knownTypes,
      schemaCatalog,
      factory,
      context: "inline",
    }) as ts.TypeNode
  );

  if (context === "inline") {
    return itemOfType;
  }

  if (context === "namespace" || context === "interface") {
    return addJsDocAnnotation(
      type,
      factory.createTypeAliasDeclaration(
        undefined,
        factory.createIdentifier(type.id),
        undefined,
        itemOfType
      )
    );
  }

  throw new Error("Invalid type generator context");
};
