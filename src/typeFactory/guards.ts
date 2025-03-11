/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

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
  FunctionType,
  WithFunctions,
  AsyncFunctionType,
  WithProps,
  WithFunctionParameters,
  WithName,
  WithDeprecation,
  WithUnsupported,
  WithReturn,
  WithMaybeAsync,
  StaticValueType,
  WithExtraParameters,
} from "./types";

export const isWithId = (type: any): type is WithId => {
  return (type as WithId).id !== undefined;
};

export const isWithName = (type: any): type is WithName => {
  return (type as WithName).name !== undefined;
};

export const isWithDescription = (type: any): type is WithDescription => {
  return (type as WithDescription).description !== undefined;
};

export const isWithDeprecation = (type: any): type is WithDeprecation => {
  return (type as WithDeprecation).deprecated !== undefined;
};

export const isWithUnsupported = (type: any): type is WithUnsupported => {
  return (type as WithUnsupported).unsupported !== undefined;
};

export const isUnsupported = (type: any): type is WithUnsupported => {
  return (
    isWithUnsupported(type) && (type as WithUnsupported).unsupported === true
  );
};

export const isOptional = (type: any): type is WithOptional => {
  return (
    (type as WithOptional).optional === true ||
    (type as WithOptional).optional === "omit-key-if-missing"
  );
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
export const isFunctionType = (
  type: WebExtensionType
): type is FunctionType => {
  return (type as FunctionType).type === "function";
};

export const isAsyncFunctionType = (
  type: WebExtensionType
): type is AsyncFunctionType => {
  return isFunctionType(type) && (type as AsyncFunctionType).async === true;
};

export const isMaybeAsyncFunctionType = (
  type: WebExtensionType
): type is WithMaybeAsync => {
  return (
    isFunctionType(type) &&
    (type as WithMaybeAsync).async !== undefined &&
    (typeof (type as WithMaybeAsync).async === "boolean" ||
      typeof (type as WithMaybeAsync).async === "string")
  );
};

export const isWithFunctionParameters = (
  type: WebExtensionType
): type is WithFunctionParameters => {
  return (
    (type as WithFunctionParameters).parameters !== undefined &&
    Array.isArray((type as WithFunctionParameters).parameters) &&
    (type as WithFunctionParameters).parameters.length > 0
  );
};

export const isWithExtraParameters = (
  type: WebExtensionType
): type is WithExtraParameters => {
  return (
    (type as WithExtraParameters).extraParameters !== undefined &&
    Array.isArray((type as WithExtraParameters).extraParameters) &&
    (type as WithExtraParameters).extraParameters.length > 0
  );
};

export const isWithFunctionReturn = (
  type: WebExtensionType
): type is WithReturn => (type as WithReturn).returns !== undefined;

export const isWithFunctions = (
  type: WebExtensionType
): type is WithFunctions => {
  return Array.isArray((type as WithFunctions).functions);
};

export const isWithProps = (type: WebExtensionType): type is WithProps => {
  return (type as WithProps).properties !== undefined;
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

export const isStaticValueType = (
  type: WebExtensionType
): type is StaticValueType => {
  return (type as StaticValueType).value !== undefined;
};
