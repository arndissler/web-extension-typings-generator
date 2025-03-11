/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import ts from "typescript";
import {
  FunctionType,
  WithDescription,
  WithOptional,
} from "./typeFactory/types";
import {
  isOptional,
  isWithDeprecation,
  isWithDescription,
  isWithFunctionParameters,
} from "./typeFactory/guards";

export enum IdentifierTreatment {
  invalid = 0,
  valid = 1,
  escaped = 2,
}

export const findIdentifierTreatment = (name: string): IdentifierTreatment => {
  if (name.match(/^[a-zA-Z_$]{1}[a-zA-Z0-9_$]*$/)) {
    return IdentifierTreatment.valid;
  } else if (name.match(/[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*/u)) {
    // see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#identifiers
    return IdentifierTreatment.escaped;
  } else {
    return IdentifierTreatment.invalid;
  }
};

export const createIdentifier = (
  id: string,
  factory: ts.NodeFactory
): ts.Identifier | ts.StringLiteral => {
  switch (findIdentifierTreatment(id)) {
    case IdentifierTreatment.valid:
      return factory.createIdentifier(id);
    case IdentifierTreatment.escaped:
      return factory.createStringLiteral(id);
    case IdentifierTreatment.invalid:
      throw Error(`Invalid identifier: ${id}`);
  }
};

export const addJsDocAnnotation = <T extends ts.Node>(
  type: any,
  returnType: T
): T => {
  let description = "";
  let deprecationMessage = "";

  if (isWithDeprecation(type)) {
    deprecationMessage = `*\n* @deprecated ${type.deprecated}`;
  }
  if (isWithDescription(type)) {
    description = `*\n* ${sanitizeDescription(type.description)}`;
  }

  const comment = `${description}${deprecationMessage}`.trim();

  if (comment.length === 0) {
    return returnType;
  } else {
    return ts.addSyntheticLeadingComment(
      returnType,
      ts.SyntaxKind.MultiLineCommentTrivia,
      comment,
      true
    );
  }
};

export const createDescription = (
  type: WithDescription,
  factory: ts.NodeFactory
) => {
  const comment = factory.createJSDocComment(
    sanitizeDescription(type.description),
    undefined
  );
  return comment;
};

export const sanitizeDescription = (description: string) => {
  return description
    .replace(/<\/?var>/g, "`")
    .replace(/<\/?em>/g, "_")
    .replace(/<\/?code>/g, "`")
    .replace(/\$\(ref:([a-zA-Z\.0-9]+)\)/g, "{@link $1}")
    .replace(
      /<a href=['"]?(https:\/\/[a-zA-Z0-9\.\/\-_#]+)['"]?[^>]*>([^<]*)<\/a>/g,
      "{@link $1|$2}"
    );
};

export const hasNonTrailingOptionalParameters = (type: FunctionType) => {
  const params = isWithFunctionParameters(type) ? type.parameters || [] : [];
  const result: Array<number> = [];

  params.reduce((acc, param, index, source) => {
    if (
      isOptional(param) &&
      source.findIndex(
        (x, idx) =>
          typeof (x as unknown as WithOptional).optional === "undefined" &&
          idx > index
      ) >= 0
    ) {
      acc.push(index);
    }
    return acc;
  }, result);

  return result;
};

export const pascalCase = (...words: string[]) =>
  words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
