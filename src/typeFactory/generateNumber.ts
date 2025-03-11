/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import ts from "typescript";
import { NumberType, TypeGeneratorContext } from "./types";

export const generateNumberType = (
  type: NumberType,
  ctx: TypeGeneratorContext
) => {
  const { currentNamespace, knownTypes, schemaCatalog, context, factory } = ctx;

  if (context === "inline") {
    return factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);
  }

  if (context === "namespace" || context === "interface") {
    return factory.createTypeAliasDeclaration(
      [factory.createToken(ts.SyntaxKind.ExportKeyword)],
      factory.createIdentifier(type.id),
      undefined,
      factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword)
    );
  }

  throw new Error("Invalid type generator context");
};
