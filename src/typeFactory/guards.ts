import {
  WithId,
  WithDescription,
  WithOptional,
  WebExtensionType,
  BooleanType,
  ReferenceType,
  ArrayType,
  StringType,
  EnumStringType,
  IntegerType,
  NullType,
  UnionType,
  ObjectType,
  NumberType,
  WithInstanceOf,
  WithPatternProperties,
  AnyType,
  WithAdditionalProperties,
} from "./types";

export const isWithId = (type: any): type is WithId => {
  return (type as WithId).id !== undefined;
};

export const isWithDescription = (type: any): type is WithDescription => {
  return (type as WithDescription).description !== undefined;
};

export const isOptional = (type: any): type is WithOptional => {
  return (type as WithOptional).optional === true;
};

export const isBooleanType = (type: WebExtensionType): type is BooleanType => {
  return (type as BooleanType).type === "boolean";
};

export const isUnionType = (type: WebExtensionType): type is UnionType => {
  return (
    (type as UnionType).choices !== undefined &&
    Array.isArray((type as UnionType).choices)
  );
};

export const isWithAdditionalProperties = (
  type: ObjectType
): type is WithAdditionalProperties => {
  return (type as WithAdditionalProperties).additionalProperties !== undefined;
};

export const isReferenceType = (
  type: WebExtensionType
): type is ReferenceType => {
  return (type as ReferenceType).$ref !== undefined;
};

export const isAnyType = (type: WebExtensionType): type is AnyType => {
  return (type as AnyType).type === "any";
};

export const isObjectType = (type: WebExtensionType): type is ObjectType => {
  return (type as ObjectType).type === "object";
};

export const isWithInstanceOf = (type: ObjectType): type is WithInstanceOf => {
  return (type as WithInstanceOf).isInstanceOf !== undefined;
};

export const isWithPatternProperties = (
  type: ObjectType
): type is WithPatternProperties => {
  return (type as WithPatternProperties).patternProperties !== undefined;
};

export const isArrayType = (type: WebExtensionType): type is ArrayType => {
  return (
    (type as ArrayType).type === "array" &&
    (type as ArrayType).items !== undefined
  );
};

export const isStringType = (type: WebExtensionType): type is StringType => {
  return (type as StringType).type === "string";
};

export const isEnumStringType = (type: StringType): type is EnumStringType => {
  return (type as EnumStringType).enum !== undefined;
};

export const isIntegerType = (type: WebExtensionType): type is IntegerType => {
  return (type as IntegerType).type === "integer";
};

export const isNumberType = (type: WebExtensionType): type is NumberType => {
  return (type as NumberType).type === "number";
};

export const isNullType = (type: WebExtensionType): type is NullType => {
  return (type as NullType).type === "null";
};
