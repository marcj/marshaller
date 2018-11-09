import {Types} from "./mapper";
import {ClassType} from "./utils";
import {AddValidator, PropertyValidator, PropertyValidatorError} from "./validation";

export function Entity(name: string, collectionName?: string) {
    return (target: Object) => {
        Reflect.defineMetadata('marshal:entityName', name, target);
        Reflect.defineMetadata('marshal:collectionName', collectionName || (name + 's'), target);
    };
}

export function DatabaseName(name: string) {
    return (target: Object) => {
        Reflect.defineMetadata('marshal:databaseName', name, target);
    };
}

export function Decorator() {
    return (target: Object, property: string) => {
        Reflect.defineMetadata('marshal:dataDecorator', property, target);
    };
}

export function ID() {
    return (target: Object, property: string) => {
        registerProperty(target, property);
        Reflect.defineMetadata('marshal:idField', property, target);
    };
}

/**
 * Exclude in *toMongo and *toPlain.
 */
export function Exclude() {
    return (target: Object, property: string) => {
        Reflect.defineMetadata('marshal:exclude', 'all', target, property);
    };
}

export function ExcludeToMongo() {
    return (target: Object, property: string) => {
        Reflect.defineMetadata('marshal:exclude', 'mongo', target, property);
    };
}

export function ExcludeToPlain() {
    return (target: Object, property: string) => {
        Reflect.defineMetadata('marshal:exclude', 'plain', target, property);
    };
}

export function registerProperty(target: Object, property: string) {
    const properties = Reflect.getMetadata('marshal:properties', target) || [];
    if (-1 === properties.indexOf(property)) {
        properties.push(property);
    }

    Reflect.defineMetadata('marshal:properties', properties, target);
}


export function Type(type: Types) {
    return (target: Object, property: string) => {
        Reflect.defineMetadata('marshal:dataType', type, target, property);
        registerProperty(target, property);
    };
}

export function ArrayType() {
    return (target: Object, property: string) => {
        class Validator implements PropertyValidator {
            async validate<T>(value: any, target: ClassType<T>, property: string): Promise<PropertyValidatorError | void> {
                if (!Array.isArray(value)) {
                    return new PropertyValidatorError('No Array given');
                }
            }
        }

        AddValidator(Validator)(target, property);
        registerProperty(target, property);
        Reflect.defineMetadata('marshal:isArray', true, target, property);
    };
}

export function MapType() {
    return (target: Object, property: string) => {

        class Validator implements PropertyValidator {
            async validate<T>(value: any, target: ClassType<T>, property: string): Promise<PropertyValidatorError | void> {
                if ('object' !== typeof value) {
                    return new PropertyValidatorError('No Map given');
                }
            }
        }


        AddValidator(Validator)(target, property);
        registerProperty(target, property);
        Reflect.defineMetadata('marshal:isMap', true, target, property);
    };
}

export function Class<T>(classType: ClassType<T>) {
    return (target: Object, property: string) => {
        Type('class')(target, property);
        Reflect.defineMetadata('marshal:dataTypeValue', classType, target, property);
    };
}

export function ClassMap<T>(classType: ClassType<T>) {
    return (target: Object, property: string) => {
        Class(classType)(target, property);
        MapType()(target, property);
        Reflect.defineMetadata('marshal:dataTypeValue', classType, target, property);
    };
}

export function ClassArray<T>(classType: ClassType<T>) {
    return (target: Object, property: string) => {
        Class(classType)(target, property);
        ArrayType()(target, property);
        Reflect.defineMetadata('marshal:dataTypeValue', classType, target, property);
    };
}

function concat(...decorators: ((target: Object, property: string) => void)[]) {
    return (target: Object, property: string) => {
        for (const decorator of decorators) {
            decorator(target, property);
        }
    }
}

export function MongoIdType() {
    return Type('objectId');
}

export function UUIDType() {
    return Type('uuid');
}

export function DateType() {
    return Type('date');
}

export function StringType() {
    class Validator implements PropertyValidator {
        async validate<T>(value: any, target: ClassType<T>, property: string): Promise<PropertyValidatorError | void> {
            if ('string' !== typeof value) {
                return new PropertyValidatorError('No String given');
            }
        }
    }

    return concat(AddValidator(Validator), Type('string'));
}

export function AnyType() {
    return Type('any');
}

export function NumberType() {
    class Validator implements PropertyValidator {
        async validate<T>(value: any, target: ClassType<T>, property: string): Promise<PropertyValidatorError | void> {
            value = parseFloat(value);

            if (!Number.isFinite(value)) {
                return new PropertyValidatorError('No Number given');
            }
        }
    }

    return concat(AddValidator(Validator), Type('number'));
}

export function BooleanType() {
    return Type('boolean');
}

export function EnumType(type: any, allowLabelsAsValue = false) {
    return (target: Object, property: string) => {
        Type('enum')(target, property);
        Reflect.defineMetadata('marshal:dataTypeValue', type, target, property);
        Reflect.defineMetadata('marshal:enum:allowLabelsAsValue', allowLabelsAsValue, target, property);
    }
}