import { DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, signal, ChangeDetectorRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';

import { Contador } from '../../ui/contador/contador';
import { Icono } from '../../ui/icono/icono';
import { Vacio } from '../../ui/vacio/vacio';

const MESES_NOMBRES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

@Component({
  selector: 'app-dashboard',
  imports: [DecimalPipe, RouterLink, Contador, Icono, Vacio],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  moneda = signal('S/');
  saludo: string = '';
  fechaHoy = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });

  ventasHoy = signal<any[]>([]);
  stockBajo = signal<any[]>([]);
  avisarStock = signal<boolean>(false);
  almacen = { empresa: signal({ nombre: 'Ferretería' }) };

  totalHoy = signal<number>(0);
  totalProductos = signal<number>(0);
  ganancia = signal<number>(0);

  meses = signal<any[]>([]);
  hayVentasMeses = signal<boolean>(false);

  alertas = signal<any[]>([]);
  ultimas = signal<any[]>([]);

  ngOnInit() {
    const h = new Date().getHours();
    this.saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    this.cargarDashboardMunoz();
  }

  cargarDashboardMunoz() {
    // 1. INVENTARIO: Total de productos en catálogo y alertas de stock bajo con su unidad ("kg", "m", "und")
    this.http.get<any[]>('http://localhost:3000/api/inventario').subscribe({
      next: (productos) => {
        if (Array.isArray(productos)) {
          this.totalProductos.set(productos.length);

          const bajos = productos
            .map(p => {
              const stockReal = Number(p.stock ?? p.stock_actual ?? 0);
              const stockMin = Number(p.stockMinimo ?? p.stock_minimo ?? 10);
              return {
                ...p,
                id: p.id,
                nombre: p.nombre || p.descripcion || 'Producto',
                unidad: p.unidad || p.unidad_medida || 'und',
                stock: stockReal,
                stockMinimo: stockMin,
                nivel: Math.min(100, Math.round((stockReal / Math.max(1, stockMin * 2)) * 100))
              };
            })
            .filter(p => p.stock <= p.stockMinimo);

          this.alertas.set(bajos);
          this.stockBajo.set(bajos);
          this.avisarStock.set(bajos.length > 0);
          this.cdr.detectChanges();
        }
      },
      error: (err) => console.error('Error al cargar inventario en dashboard:', err)
    });

    // 2. CONFIGURACIÓN: Cargar nombre comercial y moneda de la empresa
    this.http.get<any>('http://localhost:3000/api/configuracion').subscribe({
      next: (conf) => {
        if (conf?.empresa) {
          if (conf.empresa.nombre) this.almacen.empresa.set({ nombre: conf.empresa.nombre });
          if (conf.empresa.moneda) this.moneda.set(conf.empresa.moneda);
          this.cdr.detectChanges();
        }
      },
      error: () => {}
    });

    // 3. VENTAS: Vendido hoy, Ganancia del mes, Últimas ventas y Gráfico de 6 meses
    this.http.get<any[]>('http://localhost:3000/api/ventas').subscribe({
      next: (ventasRaw) => {
        const ventas = Array.isArray(ventasRaw) ? ventasRaw : [];
        const ventasActivas = ventas.filter(v => v.estado !== 'ANULADA');

        const ahora = new Date();
        const diaHoy = String(ahora.getDate()).padStart(2, '0');
        const mesHoy = String(ahora.getMonth() + 1).padStart(2, '0');
        const anioHoy = String(ahora.getFullYear());

        const formatoSlashHoy = `${diaHoy}/${mesHoy}/${anioHoy}`;
        const formatoIsoHoy = `${anioHoy}-${mesHoy}-${diaHoy}`;
        const mesSlashActual = `/${mesHoy}/${anioHoy}`;
        const mesIsoActual = `${anioHoy}-${mesHoy}-`;

        // 3.A. Ganancia del mes actual (solo ventas vigentes)
        const ventasDelMes = ventasActivas.filter(v => {
          const f = String(v.fecha || '');
          return f.includes(mesSlashActual) || f.includes(mesIsoActual);
        });
        const sumaTotalMes = ventasDelMes.reduce((acc, v) => acc + Number(v.total || 0), 0);
        this.ganancia.set(sumaTotalMes);

        // 3.B. Vendido hoy (solo ventas vigentes)
        const ventasDeHoy = ventasActivas.filter(v => {
          const f = String(v.fecha || '');
          return f.includes(formatoSlashHoy) || f.includes(formatoIsoHoy);
        });
        const sumaHoy = ventasDeHoy.reduce((acc, v) => acc + Number(v.total || 0), 0);
        this.totalHoy.set(sumaHoy);
        this.ventasHoy.set(ventasDeHoy);

        // 3.C. Últimas 5 ventas (Separando fecha y hora)
        const ultimasMapped = ventas.slice(0, 5).map(v => {
          const rawFecha = String(v.fecha || '');
          let soloFecha = rawFecha;
          let soloHora = v.hora || '';

          if (rawFecha.includes(' ')) {
            const partes = rawFecha.split(' ');
            soloFecha = partes[0];
            soloHora = soloHora || partes[1] || '';
          } else if (rawFecha.includes('T')) {
            const partes = rawFecha.split('T');
            soloFecha = partes[0];
            soloHora = soloHora || (partes[1] ? partes[1].substring(0, 5) : '');
          }

          return {
            ...v,
            id: v.id || v.codigo || '#10000',
            cliente: v.cliente || 'Cliente',
            fecha: soloFecha,
            hora: soloHora || '00:00',
            metodoPago: v.metodoPago || v.metodo_pago || 'Efectivo',
            total: Number(v.total || 0)
          };
        });
        this.ultimas.set(ultimasMapped);

        // 3.D. Gráfico de los últimos 6 meses (se calcula siempre de forma robusta)
        const acumuladoPorMes: { [key: string]: number } = {};
        ventasActivas.forEach(v => {
          const f = String(v.fecha || '');
          let mesIdx = -1;
          let anio = anioHoy;

          if (f.includes('/')) {
            const partes = f.split(' ')[0].split('/');
            if (partes.length >= 3) {
              mesIdx = parseInt(partes[1], 10) - 1;
              anio = partes[2];
            }
          } else if (f.includes('-')) {
            const partes = f.split('T')[0].split(' ')[0].split('-');
            if (partes.length >= 3) {
              anio = partes[0];
              mesIdx = parseInt(partes[1], 10) - 1;
            }
          }

          if (mesIdx >= 0 && mesIdx <= 11) {
            const clave = `${anio}-${mesIdx}`;
            acumuladoPorMes[clave] = (acumuladoPorMes[clave] || 0) + Number(v.total || 0);
          }
        });

        const listaMesesGrafico = [];
        for (let i = 5; i >= 0; i--) {
          const fechaIter = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
          const mIdx = fechaIter.getMonth();
          const aIter = fechaIter.getFullYear();
          const clave = `${aIter}-${mIdx}`;

          listaMesesGrafico.push({
            etiqueta: MESES_NOMBRES[mIdx],
            total: acumuladoPorMes[clave] || 0,
            actual: i === 0
          });
        }

        const maxValor = Math.max(...listaMesesGrafico.map(m => m.total), 1);
        const mesesConAltura = listaMesesGrafico.map(m => ({
          ...m,
          alto: m.total > 0 ? Math.max(18, Math.round((m.total / maxValor) * 100)) : 4
        }));

        this.meses.set(mesesConAltura);
        this.hayVentasMeses.set(mesesConAltura.some(m => m.total > 0));
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error al cargar ventas en dashboard:', err)
    });
  }
}