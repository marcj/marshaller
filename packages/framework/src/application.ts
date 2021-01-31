/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { ClassType, isArray } from '@deepkit/core';
import { KernelModule } from './kernel';
import { ServiceContainer } from './service-container';
import { ProviderWithScope } from './injector/provider';
import { createModule, Module, ModuleConfigOfOptions, ModuleOptions } from './module';
import { Command, Config, Options } from '@oclif/config';
import { basename, relative } from 'path';
import { Main } from '@oclif/command';
import { ExitError } from '@oclif/errors';
import { buildOclifCommand } from './command';
import { EnvConfiguration } from './configuration';

export class Application<T extends ModuleOptions<any>> {
    public readonly serviceContainer: ServiceContainer<T>;

    constructor(
        appModule: Module<T>,
        providers: ProviderWithScope<any>[] = [],
        imports: Module<any>[] = [],
    ) {
        imports = imports.slice(0);

        if (!appModule.hasImport(KernelModule)) {
            appModule.addImport(KernelModule);
        }

        this.serviceContainer = new ServiceContainer(appModule, providers, imports);
    }

    static create<T extends Module<any> | ModuleOptions<any>>(module: T): Application<T extends Module<infer K> ? K : T> {
        if (module instanceof Module) {
            return new Application(module as any);
        } else {
            //see: https://github.com/microsoft/TypeScript/issues/13995
            const mod = module as any as ModuleOptions<any>;
            return new Application(createModule(mod) as any);
        }
    }

    configure(config: ModuleConfigOfOptions<T>): this {
        const appConfig: any = {};
        const moduleConfigs: { [name: string]: any } = {};
        const moduleNames = this.serviceContainer.rootInjectorContext.getModuleNames();

        for (const i in config) {
            let name = i;
            const separator = name.indexOf('_');
            let module = '';
            if (separator > 0) {
                module = name.substr(0, separator);
                name = name.substr(separator + 1);
            }
            if (module) {
                if (!moduleConfigs[module]) moduleConfigs[module] = {};
                moduleConfigs[module][name] = config[i];
            } else {
                if (moduleNames.includes(name)) {
                    moduleConfigs[name] = config[i];
                } else {
                    appConfig[name] = config[i];
                }
            }
        }

        this.serviceContainer.appModule.setConfig(appConfig);

        for (const i in moduleConfigs) {
            const module = this.serviceContainer.rootInjectorContext.getModule(i);
            module.setConfig(moduleConfigs[i]);
        }

        return this;
    }

    /**
     * Loads a .env file and sets its configuration value.
     * 
     * `path` is either an absolute or relative path. For relative paths the first 
     * folder with a package.json starting from process.cwd() upwards is picked.
     * 
     * So if you use 'local.env' make sure a 'local.env' file is localed beside your 'package.json'.
     * 
     * `path` can be an array of paths. First existing path is picked.
     */
    loadConfigFromEnvFile(path: string | string[]): this {
        const envConfiguration = new EnvConfiguration();
        const paths = isArray(path) ? path : [path];
        for (const path of paths) {
            if (envConfiguration.loadEnvFile(path)) break;
        }

        this.configure(envConfiguration.getAll() as any);

        return this;
    }

    /**
     * Load all environment variables that start with given prefix and try to
     * find matching configuration options and set its value.
     * 
     * Example:
     * 
     * APP_databaseUrl="mongodb://localhost/mydb"
     * 
     * Application.run().loadConfigFromEnvVariables('APP_').run();
     */
    loadConfigFromEnvVariables(prefix: string = 'APP_'): this {
        const appConfig: any = {};
        const moduleConfigs: { [name: string]: any } = {};

        for (const i in process.env) {
            if (!i.startsWith(prefix)) continue;
            let name = i.substr(prefix.length);
            const separator = name.indexOf('_');
            let module = '';
            if (separator > 0) {
                module = name.substr(0, separator);
                name = name.substr(separator + 1);
            }
            if (module) {
                if (!moduleConfigs[module]) moduleConfigs[module] = {};
                moduleConfigs[module][name] = process.env[i];
            } else {
                appConfig[name] = process.env[i];
            }
        }

        this.serviceContainer.appModule.setConfig(appConfig);

        for (const i in moduleConfigs) {
            const module = this.serviceContainer.rootInjectorContext.getModule(i);
            module.setConfig(moduleConfigs[i]);
        }
        return this;
    }

    /**
     * Loads a JSON encoded environment variable and applies its content to the configuration.
     * 
     * Example:
     * 
     * APP_CONFIG={"databaseUrl": "mongodb://localhost/mydb", "moduleA": {"foo": "bar"}}
     * 
     * Application.run().loadConfigFromEnvVariable('APP_CONFIG').run();
     */
    loadConfigFromEnvVariable(variableName: string = 'APP_CONFIG'): this {
        let config = {};
        try {
            config = JSON.parse(process.env[variableName] || '');
        } catch (error) {
            throw new Error(`Invalid JSON in env varibale ${variableName}. Parse error: ${error}`);
        }

        this.configure(config as any);
        return this;
    }

    async run(argv?: any[]) {
        await this.execute(argv ?? process.argv.slice(2));
    }

    public get<T, R = T extends ClassType<infer R> ? R : T>(token: T): R {
        return this.serviceContainer.rootInjectorContext.getInjector(0).get(token);
    }

    public async execute(argv: string[]) {
        let result: any;

        class MyConfig extends Config {
            commandsMap: { [name: string]: Command.Plugin } = {};

            constructor(options: Options) {
                super(options);
                this.root = options.root;
                this.userAgent = 'Node';
                this.name = 'app';
                const bin = basename(process.argv[0]);
                this.bin = `${bin} ${relative(process.cwd(), process.argv[1]) || '.'}`;
                this.version = '0.0.1';
                this.pjson = {
                    name: this.name,
                    version: this.version,
                    oclif: {
                        update: {
                            s3: {} as any,
                            node: {}
                        }
                    }
                };
            }

            runHook<T>(event: string, opts: T): Promise<void> {
                if (event === 'postrun') {
                    result = (opts as any).result;
                }
                return super.runHook(event, opts);
            }

            findCommand(id: string, opts?: {
                must: boolean;
            }) {
                return this.commandsMap[id]!;
            }

            get commandIDs() {
                return Object.keys(this.commandsMap);
            }

            get commands() {
                return Object.values(this.commandsMap);
            }
        }

        try {
            const config = new MyConfig({ root: __dirname });
            for (const [name, controller] of this.serviceContainer.cliControllers.controllers.entries()) {
                config.commandsMap[name] = buildOclifCommand(controller, this.serviceContainer.rootInjectorContext);
            }

            await Main.run(argv, config);
        } catch (e) {
            if (e instanceof ExitError) {
                process.exit(e.oclif.exit);
            } else {
                console.log(e);
            }
        }
        return result;
    }
}
