/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import ts from "typescript";
import { isWithId } from "./guards";
import { TypeGeneratorContext, WebExtensionType } from "./types";
import { addJsDocAnnotation } from "../utils";

export const generateAnyType = (
  type: WebExtensionType,
  ctx: TypeGeneratorContext
) => {
  const { currentNamespace, knownTypes, schemaCatalog, context, factory } = ctx;

  if (context === "inline") {
    return factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
  }

  if (context === "namespace" || context === "interface") {
    if (isWithId(type)) {
      return addJsDocAnnotation(
        type,
        factory.createTypeAliasDeclaration(
          undefined,
          factory.createIdentifier(type.id),
          undefined,
          factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
        )
      );
    } else {
      throw new Error("Type without id found (of type: any)");
    }
  }

  throw new Error("Invalid type generator context");
};
