/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import ts, { PropertySignature, TypeElement, TypeNode } from "typescript";
import {
  isOptional,
  isReferenceType,
  isUnsupported,
  isWithAdditionalProperties,
  isWithFunctions,
  isWithInstanceOf,
  isWithPatternProperties,
  isWithProps,
} from "./guards";
import { ObjectType, TypeGeneratorContext } from "./types";
import {
  addJsDocAnnotation,
  createIdentifier,
  findIdentifierTreatment,
  IdentifierTreatment,
} from "../utils";
import { createSingleTyping } from "./index";

export const generateObjectType = (
  type: ObjectType,
  ctx: TypeGeneratorContext
) => {
  const { currentNamespace, knownTypes, schemaCatalog, context, factory } = ctx;

  let _type = undefined;
  let objectDefinition = {
    functions: new Array<ts.MethodSignature>(),
    properties: new Array<ts.PropertySignature>(),
    patternProperties: new Array<ts.TypeNode>(),
  };

  // when we have an instanceOf, we create a type reference node
  if (isWithInstanceOf(type)) {
    _type = factory.createTypeReferenceNode(type.isInstanceOf);
  }

  if (isWithFunctions(type)) {
    const functions = type.functions || [];
    objectDefinition.functions = functions
      .map((func) => {
        const singleTyping = createSingleTyping(func, {
          currentNamespace,
          knownTypes,
          schemaCatalog,
          factory,
          context: "interface",
        });

        if (isUnsupported(func)) {
          console.warn(
            `Warning: skipping unsupported function ${[
              currentNamespace,
              type.id,
              func.name,
            ]
              .filter(Boolean)
              .join(".")}`
          );
          return;
        }

        if (singleTyping && ts.isMethodSignature(singleTyping)) {
          return singleTyping;
        }

        console.error(
          `Error: not a function: ${[currentNamespace, type.id, func.name]
            .filter(Boolean)
            .join(".")}`
        );
        return undefined;
      })
      .filter((item) => item !== undefined);
  }

  if (isWithProps(type)) {
    const props: PropertySignature[] = [];
    Object.entries(type.properties).forEach(([propName, subType]) => {
      const _type = createSingleTyping(subType, {
        currentNamespace,
        knownTypes,
        schemaCatalog,
        factory,
        context: "inline",
      });

      if (_type == undefined) {
        const typeName = [currentNamespace, type.id, propName]
          .filter(Boolean)
          .join(".");
        if (isUnsupported(subType)) {
          console.warn(`Warning: skipping unsupported property ${typeName}`);
        } else {
          console.error(`Error: cannot create property type for ${typeName}`);
        }
      } else {
        const identifier = createIdentifier(propName, factory);
        props.push(
          addJsDocAnnotation(
            subType,
            factory.createPropertySignature(
              undefined,
              identifier,
              isOptional(subType)
                ? factory.createToken(ts.SyntaxKind.QuestionToken)
                : undefined,
              _type as ts.TypeNode
            )
          )
        );
      }
      // }
    });

    objectDefinition.properties = props;
  }

  if (isWithPatternProperties(type)) {
    // pattern props narrow down to an index signature with a union type
    const props = Object.entries(type.patternProperties);
    props.forEach(([propName, value]) => {
      const propNameIdentifier = findIdentifierTreatment(propName);
      const isValidPropertyName =
        propNameIdentifier === IdentifierTreatment.valid;
      const propType = createSingleTyping(value, {
        currentNamespace,
        knownTypes,
        schemaCatalog,
        factory,
        context: "inline",
      });

      if (isValidPropertyName) {
        // the property name is valid, and we have a type for it

        const identifier = createIdentifier(propName, factory);
        objectDefinition.properties.push(
          addJsDocAnnotation(
            value,
            factory.createPropertySignature(
              undefined,
              identifier,
              isOptional(value)
                ? factory.createToken(ts.SyntaxKind.QuestionToken)
                : undefined,
              propType as ts.TypeNode
            )
          )
        );
      } else {
        // the pattern property name is not valid, so create an index property
        if (propType && ts.isTypeNode(propType)) {
          objectDefinition.patternProperties.push(propType);
        }
      }
    }),
      [];
  }

  let additionalType = undefined as ts.TypeNode | undefined;
  if (isWithAdditionalProperties(type)) {
    if (
      "boolean" === typeof type.additionalProperties &&
      type.additionalProperties === true
    ) {
      // when it's only "additionalProperties: true", we allow any additional properties
      additionalType = factory.createTypeLiteralNode([
        factory.createIndexSignature(
          undefined,
          [
            factory.createParameterDeclaration(
              undefined,
              undefined,
              factory.createIdentifier("key"),
              undefined,
              factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
              undefined
            ),
          ],
          factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
        ),
      ]);
    } else if (
      "object" === typeof type.additionalProperties &&
      type.additionalProperties.type
    ) {
      const propType = createSingleTyping(type.additionalProperties, {
        currentNamespace,
        knownTypes,
        schemaCatalog,
        factory,
        context: "inline",
      });
      if (propType && ts.isTypeNode(propType)) {
        additionalType = factory.createTypeLiteralNode([
          factory.createIndexSignature(
            undefined,
            [
              factory.createParameterDeclaration(
                undefined,
                undefined,
                factory.createIdentifier("key"),
                undefined,
                factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
                undefined
              ),
            ],
            propType
          ),
        ]);
      } else {
        additionalType = factory.createKeywordTypeNode(
          ts.SyntaxKind.AnyKeyword
        );
      }
    } else if (
      "boolean" !== typeof type.additionalProperties &&
      isReferenceType(type.additionalProperties)
    ) {
      additionalType = factory.createTypeLiteralNode([
        factory.createIndexSignature(
          undefined,
          [
            factory.createParameterDeclaration(
              undefined,
              undefined,
              factory.createIdentifier("key"),
              undefined,
              factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
              undefined
            ),
          ],
          factory.createTypeReferenceNode(type.additionalProperties.$ref)
        ),
      ]);
    }
  }

  if (context === "inline") {
    const _maybeProps = [
      ...objectDefinition.properties,
      ...objectDefinition.functions,
    ];
    const maybeObject = factory.createTypeLiteralNode(_maybeProps);

    if (additionalType) {
      // when we only have "additionalProperties", it defines the whole object
      if (_maybeProps.length === 0) {
        return additionalType;
      }

      // TODO: create an intersection only with a type literal node
      return factory.createIntersectionTypeNode([maybeObject, additionalType]);
    }

    if (_maybeProps.length === 0) {
      // if there are no properties defined, return an indexable object
      return factory.createTypeLiteralNode([
        factory.createIndexSignature(
          undefined,
          [
            factory.createParameterDeclaration(
              undefined,
              undefined,
              factory.createIdentifier("key"),
              undefined,
              factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
              undefined
            ),
          ],
          factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
        ),
      ]);
    }
    return maybeObject;
  }

  if (context === "namespace" || context === "interface") {
    const _props = [
      ...objectDefinition.properties,
      ...objectDefinition.functions,
    ] as TypeElement[];

    let unionType = undefined as ts.TypeNode | undefined;
    let indexSignature = undefined as ts.IndexSignatureDeclaration | undefined;

    if (objectDefinition.patternProperties.length > 0) {
      unionType = factory.createUnionTypeNode([
        ...objectDefinition.patternProperties,
      ]);

      indexSignature = factory.createIndexSignature(
        undefined,
        [
          factory.createParameterDeclaration(
            undefined,
            undefined,
            factory.createIdentifier("key"),
            undefined,
            factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
            undefined
          ),
        ],
        unionType
      );

      _props.push(indexSignature);
    }

    const maybeInterface = factory.createInterfaceDeclaration(
      [factory.createToken(ts.SyntaxKind.ExportKeyword)],
      factory.createIdentifier(type.id),
      undefined,
      undefined,
      _props
    );

    return addJsDocAnnotation(type, maybeInterface);
  }

  throw new Error("Invalid type generator context");
};
