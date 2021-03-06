/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { AppModule } from '@deepkit/app';
import { AngularUniversalListener } from './listener';
import { config } from './config';

export const angularUniversalModule = new AppModule({
    config: config,
    listeners: [
        AngularUniversalListener
    ]
}, 'angular-universal').forRoot();
