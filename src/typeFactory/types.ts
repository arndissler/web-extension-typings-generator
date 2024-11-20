export interface WithDescription {
  description: string;
}

export interface WithId {
  id: string;
}

export interface WithOptional {
  optional: boolean;
}

export interface AnyType {
  type: "any";
}

export interface WithInstanceOf extends ObjectType {
  isInstanceOf: string;
}

export interface WithFunctions extends ObjectType {
  functions: FunctionType[];
}

export interface WithPatternProperties extends ObjectType {
  patternProperties: { [key: string]: SingleType & WithOptional };
}

export interface WithAdditionalProperties extends ObjectType {
  additionalProperties: boolean | (SingleType & WithOptional);
}

export interface ReferenceType extends WithId, WithDescription {
  $ref: string;
}

export interface ObjectType extends WithId, WithDescription {
  type: "object";
  options: SingleType[];
  properties: { [key: string]: SingleType & WithOptional };
}

export interface EnumType extends WithId, WithDescription {
  enum: string[];
}

export interface ArrayType extends WithId, WithDescription {
  type: "array";
  items: SingleType;
}

export interface FunctionType extends WithDescription {
  type: "function";
  name: string;
}

export interface AsyncFunctionType extends FunctionType {
  async: boolean;
}

export interface OptionalFunctionType extends FunctionType {
  optional: boolean;
}

export interface SingleType extends WithId, WithDescription {
  type:
    | "number"
    | "string"
    | "integer"
    | "boolean"
    | "object"
    | "array"
    | "null";
}

export interface UnionType extends WithId, WithDescription {
  choices: WebExtensionType[];
}

export type SimpleStringType = SingleType & { type: "string" };

export type NumberType = SingleType & { type: "number" };

export type IntegerType = SingleType & { type: "integer" };

export type BooleanType = SingleType & { type: "boolean" };

export type EnumStringType = EnumType & SimpleStringType;

export type StringType = SimpleStringType | EnumStringType;

export type NullType = { type: "null" };

export type WebExtensionType =
  | AnyType
  | ArrayType
  | BooleanType
  | EnumType
  | FunctionType
  | IntegerType
  | NullType
  | NumberType
  | ObjectType
  | ReferenceType
  | SingleType
  | StringType
  | UnionType;

export type WebExtensionSchemaMapping = {
  [key: string]: {
    types: WebExtensionType[];
    events: any[];
    functions: FunctionType[];
    permissions: string[];
    properties: any[];
    description: string;
    sourceFile: string;
  };
};
