import ts from "typescript";
import { WithDescription } from "./typeFactory/types";

enum IdentifierTreatment {
  invalid = 0,
  valid = 1,
  escaped = 2,
}

const findIdentifierTreatment = (name: string): IdentifierTreatment => {
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

export const createDescription = (
  type: WithDescription,
  factory: ts.NodeFactory
) => {
  const comment = factory.createJSDocComment(
    type.description.replace(/<\/?var>/g, "`"),
    undefined
  );
  return comment;
};
