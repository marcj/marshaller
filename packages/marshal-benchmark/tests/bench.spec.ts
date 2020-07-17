import 'jest-extended';
import 'reflect-metadata';
import {
    classToPlain as classTransformerClassToPlain,
    plainToClass as classTransformerPlainToClass
} from "class-transformer";
import {BenchSuite} from "@super-hornet/core";
import {f, jitClassToPlain, jitPlainToClass, plainToClass} from "@super-hornet/marshal";
import {autoserializeAs, autoserializeAsArray, Deserialize, Serialize} from "cerialize";

export class MarshalModel {
    @f ready?: boolean;

    @f.array(String) tags: string[] = [];

    @f priority: number = 0;

    constructor(
        @f public id: number,
        @f public name: string
    ) {
    }
}

export class ClassTransformerModel {
    public id?: number;
    public name?: string;

    ready?: boolean;

    tags: string[] = [];

    priority: number = 0;
}

export class CerializeModel {
    @autoserializeAs(Number) id?: number;
    @autoserializeAs(String) public name?: string;

    @autoserializeAs(Boolean) ready?: boolean;

    @autoserializeAsArray(String) tags: string[] = [];

    @autoserializeAs(Number) priority: number = 0;
}

test('benchmark plainToClass', () => {
    const plain = {
        name: 'name',
        id: 2,
        tags: ['a', 'b', 'c'],
        priority: 5,
        ready: true,
    }
    const suite = new BenchSuite('plainToClass simple model', 100_000);

    suite.add('Marshal', (i) => {
        plainToClass(MarshalModel, plain);
    });

    // console.log('jit', getJitFunctionPlainToClass(MarshalModel).toString());

    suite.add('ClassTransformer', (i) => {
        classTransformerPlainToClass(ClassTransformerModel, plain);
    });

    suite.add('Cerialize', (i) => {
        Deserialize(plain, CerializeModel);
    });

    suite.run();
});

test('benchmark classToPlain', () => {
    const b = jitPlainToClass(MarshalModel, {
        name: 'name1',
        id: 1,
        tags: ['a', 2, 'c'],
        priority: 5,
        ready: true,
    });

    const suite = new BenchSuite('classToPlain simple model', 100_000);

    suite.add('Marshal', (i) => {
        jitClassToPlain(MarshalModel, b);
    });

    // console.log('jit', getJitFunctionClassToPlain(MarshalModel).toString());

    suite.add('ClassTransformer', (i) => {
        classTransformerClassToPlain(b);
    });

    suite.add('Cerialize', (i) => {
        Serialize(b, CerializeModel);
    });

    suite.run();
});
