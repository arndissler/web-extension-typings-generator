/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import ts from "typescript";
import { TypeGeneratorContext, UnionType } from "./types";
import { addJsDocAnnotation } from "../utils";
import { createSingleTyping } from "./index";
import { isWithId } from "./guards";

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
    if (!isWithId(type)) {
      throw new Error("Union type must have an id");
    }

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
