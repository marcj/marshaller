/*
 * Deepkit Framework
 * Copyright (C) 2020 Deepkit UG
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import {arrayRemoveItem, ClassType, getClassName, isClass} from '@deepkit/core';
import {httpClass} from './decorator';
import {EventDispatcher} from './event';
import {Module, ModuleOptions} from './module';
import {Injector, tokenLabel} from './injector/injector';
import {ProviderWithScope} from './injector/provider';
import {rpcClass} from '@deepkit/framework-shared';
import {cli} from './command';
import {HttpControllers} from './router';
import {InjectorContext, Context, ContextRegistry} from './injector/injector';

export interface OnInit {
    onInit: () => Promise<void>;
}

export interface onDestroy {
    onDestroy: () => Promise<void>;
}

export type RpcController = {
    onDestroy?: () => Promise<void>;
    onInit?: () => Promise<void>;
}

export class RpcControllers {
    public readonly controllers = new Map<string, ClassType>();

    public resolveController(name: string): ClassType {
        const classType = this.controllers.get(name);
        if (!classType) throw new Error(`Controller not found for ${name}`);

        return classType;
    }
}

export class CliControllers {
    public readonly controllers = new Map<string, ClassType>();
}

export class ServiceContainer<C extends ModuleOptions<any> = ModuleOptions<any>> {
    public readonly cliControllers = new CliControllers;
    public readonly rpcControllers = new RpcControllers;
    public readonly httpControllers = new HttpControllers([]);

    protected currentIndexId = 0;

    protected contextManager = new ContextRegistry();
    public rootScopedContext = new InjectorContext(this.contextManager, 'module');
    protected eventListenerContainer = new EventDispatcher(this.rootScopedContext);

    protected rootContext?: Context;
    protected moduleContexts = new Map<Module<ModuleOptions<any>>, Context[]>();
    protected moduleIdContexts = new Map<number, Context[]>();

    public readonly appModule: Module<C>;

    constructor(
        appModule: Module<C>,
        providers: ProviderWithScope[] = [],
        imports: Module<any>[] = [],
    ) {
        this.appModule = this.processRootModule(appModule.clone(), providers, imports);
        this.bootstrapModules();
    }

    protected processRootModule(
        appModule: Module<any>,
        providers: ProviderWithScope[] = [],
        imports: Module<any>[] = []
    ) {
        this.setupHook(appModule);

        providers.push({provide: ServiceContainer, useValue: this});
        providers.push({provide: EventDispatcher, useValue: this.eventListenerContainer});
        providers.push({provide: HttpControllers, useValue: this.httpControllers});
        providers.push({provide: CliControllers, useValue: this.cliControllers});
        providers.push({provide: RpcControllers, useValue: this.rpcControllers});
        providers.push({provide: InjectorContext, useValue: this.rootScopedContext});

        this.rootContext = this.processModule(appModule, undefined, providers, imports);
        return appModule;
    }

    private setupHook(module: Module<any>) {
        const config = module.getConfig();
        for (const setup of module.setups) setup(module, config);

        for (const importModule of module.getImports()) {
            this.setupHook(importModule);
        }
        return module;
    }

    bootstrapModules(): void {
        for (const [module, contexts] of this.moduleContexts.entries()) {
            for (const context of contexts) {
                if (module.options.bootstrap) {
                    this.getInjectorFor(module).get(module.options.bootstrap);
                }
            }
        }
    }

    public getInjectorFor(module: Module<any>): Injector {
        const contexts = this.moduleIdContexts.get(module.id) || [];
        if (!contexts.length) throw new Error('Module not registered.');
        return this.rootScopedContext.getInjector(contexts[0].id);
    }

    protected getContext(id: number): Context {
        const context = this.contextManager.get(id);
        if (!context) throw new Error(`No context for ${id} found`);

        return context;
    }

    protected getNewContext(module: Module<any>, parent?: Context): Context {
        const newId = this.currentIndexId++;
        const context = new Context(newId, parent);
        this.contextManager.set(newId, context);

        let contexts = this.moduleContexts.get(module);
        if (!contexts) {
            contexts = [];
            this.moduleContexts.set(module, contexts);
            this.moduleIdContexts.set(module.id, contexts);
        }

        contexts.push(context);
        return context;
    }

    protected processModule(
        module: Module<ModuleOptions<any>>,
        parentContext?: Context,
        additionalProviders: ProviderWithScope[] = [],
        additionalImports: Module<any>[] = []
    ): Context {
        const exports = module.options.exports ? module.options.exports.slice(0) : [];
        const providers = module.options.providers ? module.options.providers.slice(0) : [];
        const controllers = module.options.controllers ? module.options.controllers.slice(0) : [];
        const imports = module.options.imports ? module.options.imports.slice(0) : [];
        const listeners = module.options.listeners ? module.options.listeners.slice(0) : [];

        providers.push(...additionalProviders);
        imports.unshift(...additionalImports);

        //we add the module to its own providers so it can depend on its module providers.
        //when we would add it to root it would have no access to its internal providers.
        if (module.options.bootstrap) providers.push(module.options.bootstrap);

        const forRootContext = module.root;

        //we have to call getNewContext() either way to store this module in this.contexts.
        let context = this.getNewContext(module, parentContext);
        if (forRootContext) {
            context = this.getContext(0);
        }

        for (const token of exports.slice(0)) {
            // if (isModuleToken(token)) {
            if (token instanceof Module) {
                //exported modules will be removed from `imports`, so that
                //the target context (root or parent) imports it
                arrayRemoveItem(exports, token);

                //we remove it from imports as well, so we don't have two module instances
                arrayRemoveItem(imports, token);

                //exported a module. We handle it as if the parent would have imported it.
                this.processModule(token, parentContext);
            }
        }

        for (const imp of imports) {
            if (!imp) continue;
            this.processModule(imp, context);
        }

        for (const listener of listeners) {
            if (isClass(listener)) {
                providers.unshift({provide: listener});
                this.eventListenerContainer.registerListener(listener, context);
            } else {
                this.eventListenerContainer.add(listener.eventToken, {fn: listener.callback, priority: listener.priority});
            }
        }

        for (const controller of controllers) {
            const rpcConfig = rpcClass._fetch(controller);
            if (rpcConfig) {
                providers.unshift({provide: controller, scope: 'rpc'});
                (controller as any)[InjectorContext.contextSymbol] = context;
                this.rpcControllers.controllers.set(rpcConfig.getPath(), controller);
                continue;
            }

            const httpConfig = httpClass._fetch(controller);
            if (httpConfig) {
                providers.unshift({provide: controller, scope: 'http'});
                (controller as any)[InjectorContext.contextSymbol] = context;
                this.httpControllers.add(controller);
                continue;
            }

            const cliConfig = cli._fetch(controller);
            if (cliConfig) {
                providers.unshift({provide: controller, scope: 'cli'});
                (controller as any)[InjectorContext.contextSymbol] = context;
                this.cliControllers.controllers.set(cliConfig.name, controller);
                continue;
            }

            throw new Error(`Controller ${getClassName(controller)} has no @http.controller() or @rpc.controller() decorator`);
        }

        //if there are exported tokens, their providers will be added to the parent or root context
        //and removed from module providers.
        const exportedProviders = forRootContext ? this.getContext(0).providers : (parentContext ? parentContext.providers : []);
        for (const token of exports) {
            if (token instanceof Module) throw new Error('Should already be handled');

            const provider = providers.findIndex(v => token === (isClass(v) ? v : v.provide));
            if (provider === -1) {
                throw new Error(`Export ${tokenLabel(token)}, but not provided in providers.`);
            }
            exportedProviders.push(providers[provider]);
            providers.splice(provider, 1);
        }

        context.providers.push(...providers);

        return context;
    }

}
