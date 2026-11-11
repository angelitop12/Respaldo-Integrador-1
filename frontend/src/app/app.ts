import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Tema } from './services/tema';
import { Avisos } from './ui/avisos/avisos';
import { ConfirmarVentana } from './ui/confirmar/confirmar';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Avisos, ConfirmarVentana],
  host: { '(document:pointermove)': 'luz($event)' },
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  constructor() {
    inject(Tema); // aplica el tema guardado al arrancar
  }

  // Los paneles se iluminan donde está el cursor: guardamos su posición en dos variables CSS
  luz(e: PointerEvent) {
    const panel = (e.target as HTMLElement | null)?.closest?.('.hoja, .ficha') as HTMLElement | null;
    if (!panel) return;
    const caja = panel.getBoundingClientRect();
    panel.style.setProperty('--mx', e.clientX - caja.left + 'px');
    panel.style.setProperty('--my', e.clientY - caja.top + 'px');
  }
}
