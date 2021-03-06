import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PropertySchema } from '@deepkit/type';

@Component({
    template: `
        <dui-input round textured lightFocus type="datetime-local" focus style="width: 100%"
                   (focusChange)="$event ? false : done.emit()"
                   (enter)="done.emit()" (esc)="done.emit()"
                   (keyDown)="keyDown.emit($event)"
                   [(ngModel)]="model"
                   (ngModelChange)="modelChange.emit(this.model)"
        ></dui-input>
    `
})
export class DateInputComponent {
    @Input() model: any;
    @Output() modelChange = new EventEmitter();

    @Input() property!: PropertySchema;

    @Output() done = new EventEmitter<void>();
    @Output() change = new EventEmitter<void>();
    @Output() keyDown = new EventEmitter<KeyboardEvent>();
}
