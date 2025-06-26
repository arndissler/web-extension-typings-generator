/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { StringType, TypeGeneratorContext } from "./types";
import { isEnumStringType, isWithDescription, isWithName } from "./guards";
import ts from "typescript";
import { addJsDocAnnotation } from "../utils";

export const generateStringType = (
  type: StringType,
  ctx: TypeGeneratorContext
) => {
  const { currentNamespace, knownTypes, schemaCatalog, context, factory } = ctx;

  // string enum type creates a string literal union type
  if (isEnumStringType(type)) {
    const choices = type.enum
      .map((value) => {
        if (typeof value === "string") {
          return factory.createLiteralTypeNode(
            factory.createStringLiteral(value)
          );
        }

        if (isWithName(value)) {
          let result = factory.createLiteralTypeNode(
            factory.createStringLiteral(value.name)
          );
          if (isWithDescription(value)) {
            result = addJsDocAnnotation(value, result);
          }

          return result;
        }

        return null;
      })
      .filter((item) => item !== null);
    const _type = factory.createUnionTypeNode(
      choices.length > 0
        ? choices
        : [factory.createKeywordTypeNode(ts.SyntaxKind.NeverKeyword)]
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
