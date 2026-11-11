import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';

// Número que "sube" hasta su valor al aparecer y cada vez que cambia.
// Uso:  <app-contador [valor]="total()" [decimales]="2" />
@Component({
  selector: 'app-contador',
  template: `{{ texto() }}`,
})
export class Contador {
  valor = input.required<number>();
  decimales = input(0);
  duracion = input(1100);

  private mostrado = signal(0);
  texto = computed(() =>
    this.mostrado().toLocaleString('es-PE', {
      minimumFractionDigits: this.decimales(),
      maximumFractionDigits: this.decimales(),
    })
  );

  constructor() {
    let cuadro = 0;

    effect(() => {
      const meta = this.valor();
      const duracion = this.duracion();
      const desde = untracked(this.mostrado);
      cancelAnimationFrame(cuadro);

      // Quien pidió menos movimiento ve el número final de inmediato
      const reducir = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reducir || duracion <= 0 || desde === meta) {
        this.mostrado.set(meta);
        return;
      }

      const inicio = performance.now();
      const paso = (ahora: number) => {
        const t = Math.min(1, (ahora - inicio) / duracion);
        const suave = 1 - Math.pow(1 - t, 3);
        this.mostrado.set(desde + (meta - desde) * suave);
        if (t < 1) cuadro = requestAnimationFrame(paso);
      };
      cuadro = requestAnimationFrame(paso);
    });

    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(cuadro));
  }
}
