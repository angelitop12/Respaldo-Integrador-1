import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Contador } from '../../ui/contador/contador';
import { Icono } from '../../ui/icono/icono';
import { Vacio } from '../../ui/vacio/vacio';

export interface MesCard {
  clave: string; // ej: "2026-10"
  nombreMes: string; // ej: "Octubre"
  anio: number; // ej: 2026
  etiqueta: string; // ej: "Octubre 2026"
  esActual: boolean;
  totalVentas: number;
  montoGenerado: number;
}

export interface DiaEvolucion {
  dia: number;
  fechaTexto: string;
  total: number;
  alto: number; // 0 - 100%
  esHoy: boolean;
}

export interface MetodoDesglose {
  nombre: string;
  total: number;
  porcentaje: number;
  color: string;
}

export interface TopItem {
  nombre: string;
  cantidad: number;
  total: number;
  subtexto?: string;
}

const NOMBRES_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

@Component({
  selector: 'app-historial-mensual',
  imports: [DecimalPipe, FormsModule, Contador, Icono, Vacio],
  templateUrl: './historial-mensual.html',
  styleUrl: './historial-mensual.css',
})
export class HistorialMensual implements OnInit {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  moneda = signal('S/');
  empresaNombre = signal('Ferretería ToolStore');

  // Datos crudos cargados de la API
  todasVentas = signal<any[]>([]);
  todasCompras = signal<any[]>([]);
  cargando = signal(true);

  // Lista de los últimos 12 meses
  ultimos12Meses = signal<MesCard[]>([]);
  mesSeleccionadoClave = signal<string>('');

  // Filtros internos de comprobantes del mes
  busquedaComprobante = signal('');
  filtroMetodoPago = signal('Todos');

  ngOnInit() {
    this.construirLista12Meses();
    this.cargarDatosBackend();
  }

  // 1. Construye exactamente los últimos 12 meses cronológicos hacia atrás
  private construirLista12Meses() {
    const ahora = new Date();
    const lista: MesCard[] = [];

    for (let i = 0; i < 12; i++) {
      const fechaIter = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
      const mIdx = fechaIter.getMonth();
      const a = fechaIter.getFullYear();
      const mesStr = String(mIdx + 1).padStart(2, '0');
      const clave = `${a}-${mesStr}`;

      lista.push({
        clave,
        nombreMes: NOMBRES_MESES[mIdx],
        anio: a,
        etiqueta: `${NOMBRES_MESES[mIdx]} ${a}`,
        esActual: i === 0,
        totalVentas: 0,
        montoGenerado: 0,
      });
    }

    this.ultimos12Meses.set(lista);
    // Por defecto se selecciona el mes actual (índice 0)
    if (lista.length > 0) {
      this.mesSeleccionadoClave.set(lista[0].clave);
    }
  }

  // 2. Consulta ventas, compras y configuración a la base de datos
  cargarDatosBackend() {
    this.cargando.set(true);

    // Configuración para el nombre de empresa y símbolo de moneda
    this.http.get<any>('http://localhost:3000/api/configuracion').subscribe({
      next: (conf) => {
        if (conf?.empresa?.moneda) this.moneda.set(conf.empresa.moneda);
        if (conf?.empresa?.nombre) this.empresaNombre.set(conf.empresa.nombre);
      },
      error: () => {}
    });

    // Cargar compras
    this.http.get<any[]>('http://localhost:3000/api/compras').subscribe({
      next: (compras) => {
        this.todasCompras.set(Array.isArray(compras) ? compras : []);
        this.recalcularTotales12Meses();
      },
      error: () => {}
    });

    // Cargar ventas
    this.http.get<any[]>('http://localhost:3000/api/ventas').subscribe({
      next: (ventas) => {
        this.todasVentas.set(Array.isArray(ventas) ? ventas : []);
        this.recalcularTotales12Meses();
        this.cargando.set(false);
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar ventas:', err);
        this.cargando.set(false);
      }
    });
  }

  // 3. Recalcula los totales rápidos de cada una de las 12 tarjetas
  private recalcularTotales12Meses() {
    const ventas = this.todasVentas().filter(v => v.estado !== 'ANULADA');

    this.ultimos12Meses.update(meses =>
      meses.map(m => {
        const [anio, mesStr] = m.clave.split('-');
        const ventasDeEsteMes = ventas.filter(v => this.perteneceAMes(v.fecha, anio, mesStr));
        const total = ventasDeEsteMes.reduce((sum, v) => sum + Number(v.total || 0), 0);

        return {
          ...m,
          totalVentas: ventasDeEsteMes.length,
          montoGenerado: total,
        };
      })
    );
  }

  // Auxiliar para saber si una fecha ("DD/MM/YYYY" o "YYYY-MM-DD") cae en un mes específico
  private perteneceAMes(fechaRaw: string, anio: string, mesStr: string): boolean {
    if (!fechaRaw) return false;
    const f = String(fechaRaw);

    // Formato latino "DD/MM/YYYY"
    if (f.includes('/')) {
      const partes = f.split(' ')[0].split('/');
      if (partes.length >= 3) {
        const dMes = partes[1].padStart(2, '0');
        const dAnio = partes[2];
        return dAnio === anio && dMes === mesStr;
      }
    }

    // Formato ISO "YYYY-MM-DD"
    if (f.includes('-')) {
      const partes = f.split('T')[0].split(' ')[0].split('-');
      if (partes.length >= 3) {
        const dAnio = partes[0];
        const dMes = partes[1].padStart(2, '0');
        return dAnio === anio && dMes === mesStr;
      }
    }

    return false;
  }

  seleccionarMes(m: MesCard) {
    this.mesSeleccionadoClave.set(m.clave);
    this.busquedaComprobante.set('');
    this.filtroMetodoPago.set('Todos');
  }

  // Información del mes actualmente seleccionado
  mesActualInfo = computed(() => {
    const clave = this.mesSeleccionadoClave();
    return this.ultimos12Meses().find(m => m.clave === clave) || this.ultimos12Meses()[0];
  });

  // Ventas activas del mes seleccionado
  ventasDelMesSeleccionado = computed(() => {
    const clave = this.mesSeleccionadoClave();
    if (!clave) return [];
    const [anio, mesStr] = clave.split('-');
    return this.todasVentas()
      .filter(v => v.estado !== 'ANULADA' && this.perteneceAMes(v.fecha, anio, mesStr));
  });

  // Todas las ventas (incluyendo anuladas) para la tabla de auditoría
  todasVentasMesConAnuladas = computed(() => {
    const clave = this.mesSeleccionadoClave();
    if (!clave) return [];
    const [anio, mesStr] = clave.split('-');
    return this.todasVentas()
      .filter(v => this.perteneceAMes(v.fecha, anio, mesStr));
  });

  // Compras del mes seleccionado
  comprasDelMesSeleccionado = computed(() => {
    const clave = this.mesSeleccionadoClave();
    if (!clave) return [];
    const [anio, mesStr] = clave.split('-');
    return this.todasCompras()
      .filter(c => this.perteneceAMes(c.fecha, anio, mesStr));
  });

  // --- KPIS DEL MES SELECCIONADO ---
  ingresosTotales = computed(() =>
    this.ventasDelMesSeleccionado().reduce((s, v) => s + Number(v.total || 0), 0)
  );

  cantidadVentas = computed(() => this.ventasDelMesSeleccionado().length);

  ticketPromedio = computed(() => {
    const cant = this.cantidadVentas();
    return cant > 0 ? this.ingresosTotales() / cant : 0;
  });

  costoCompras = computed(() =>
    this.comprasDelMesSeleccionado().reduce((s, c) => s + Number(c.costoTotal || c.costo_total || 0), 0)
  );

  margenOperativo = computed(() => this.ingresosTotales() - this.costoCompras());

  clientesAtendidos = computed(() => {
    const set = new Set(this.ventasDelMesSeleccionado().map(v => (v.cliente || '').trim()).filter(Boolean));
    return set.size;
  });

  // Comparativa porcentual respecto al mes previo
  comparativaMesPrevio = computed(() => {
    const clave = this.mesSeleccionadoClave();
    const meses = this.ultimos12Meses();
    const idx = meses.findIndex(m => m.clave === clave);
    if (idx === -1 || idx === meses.length - 1) return null; // No hay mes anterior en la lista de 12

    const mesPrevio = meses[idx + 1];
    const montoPrevio = mesPrevio.montoGenerado;
    const montoActual = this.ingresosTotales();

    if (montoPrevio === 0) {
      return montoActual > 0 ? { porcentaje: 100, positivo: true, texto: '+100% vs mes anterior' } : null;
    }

    const dif = ((montoActual - montoPrevio) / montoPrevio) * 100;
    const positivo = dif >= 0;
    const texto = `${positivo ? '+' : ''}${dif.toFixed(1)}% vs mes anterior`;
    return { porcentaje: Math.abs(dif), positivo, texto };
  });

  // --- DESGLOSE POR MÉTODO DE PAGO ---
  desgloseMetodos = computed<MetodoDesglose[]>(() => {
    const ventas = this.ventasDelMesSeleccionado();
    const total = this.ingresosTotales();
    if (total === 0) return [];

    const acumulador: Record<string, number> = {
      Efectivo: 0,
      Tarjeta: 0,
      'Yape/Plin': 0,
      Transferencia: 0,
    };

    ventas.forEach(v => {
      const met = v.metodoPago || v.metodo_pago || 'Efectivo';
      if (acumulador[met] !== undefined) {
        acumulador[met] += Number(v.total || 0);
      } else {
        acumulador['Efectivo'] += Number(v.total || 0);
      }
    });

    const colores: Record<string, string> = {
      Efectivo: '#10b981', // Verde esmeralda
      Tarjeta: '#3b82f6', // Azul
      'Yape/Plin': '#a855f7', // Púrpura Yape
      Transferencia: '#f59e0b', // Ámbar
    };

    return Object.entries(acumulador).map(([nombre, monto]) => ({
      nombre,
      total: monto,
      porcentaje: total > 0 ? Math.round((monto / total) * 100) : 0,
      color: colores[nombre] || '#0284c7',
    }));
  });

  // --- EVOLUCIÓN DÍA A DÍA EN EL MES ---
  evolucionDiaria = computed<DiaEvolucion[]>(() => {
    const clave = this.mesSeleccionadoClave();
    if (!clave) return [];
    const [anioStr, mesStr] = clave.split('-');
    const anio = parseInt(anioStr, 10);
    const mesIdx = parseInt(mesStr, 10) - 1;

    // Cantidad de días en ese mes (28, 29, 30 o 31)
    const diasEnMes = new Date(anio, mesIdx + 1, 0).getDate();

    const ahora = new Date();
    const esMesActual = ahora.getFullYear() === anio && ahora.getMonth() === mesIdx;
    const diaHoy = ahora.getDate();

    const ventas = this.ventasDelMesSeleccionado();

    // Sumar ventas por número de día
    const montosPorDia: Record<number, number> = {};
    ventas.forEach(v => {
      const f = String(v.fecha || '');
      let diaNum = -1;
      if (f.includes('/')) {
        diaNum = parseInt(f.split('/')[0], 10);
      } else if (f.includes('-')) {
        diaNum = parseInt(f.split('T')[0].split('-')[2], 10);
      }
      if (diaNum >= 1 && diaNum <= diasEnMes) {
        montosPorDia[diaNum] = (montosPorDia[diaNum] || 0) + Number(v.total || 0);
      }
    });

    const maxDia = Math.max(...Object.values(montosPorDia), 1);

    const lista: DiaEvolucion[] = [];
    for (let d = 1; d <= diasEnMes; d++) {
      const tot = montosPorDia[d] || 0;
      lista.push({
        dia: d,
        fechaTexto: `${d} de ${NOMBRES_MESES[mesIdx]}`,
        total: tot,
        alto: tot > 0 ? Math.max(12, Math.round((tot / maxDia) * 100)) : 4,
        esHoy: esMesActual && d === diaHoy,
      });
    }

    return lista;
  });

  // --- TOP CLIENTES COMPRADORES DEL MES ---
  topClientes = computed<TopItem[]>(() => {
    const ventas = this.ventasDelMesSeleccionado();
    const agrupado: Record<string, { cantidad: number; total: number }> = {};

    ventas.forEach(v => {
      const c = (v.cliente || 'Cliente General').trim();
      if (!agrupado[c]) agrupado[c] = { cantidad: 0, total: 0 };
      agrupado[c].cantidad++;
      agrupado[c].total += Number(v.total || 0);
    });

    return Object.entries(agrupado)
      .map(([nombre, data]) => ({
        nombre,
        cantidad: data.cantidad,
        total: data.total,
        subtexto: `${data.cantidad} ${data.cantidad === 1 ? 'compra' : 'compras'} en el mes`,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  });

  // --- COMPROBANTES FILTRADOS DE LA TABLA ---
  comprobantesFiltrados = computed(() => {
    const texto = this.busquedaComprobante().trim().toLowerCase();
    const metodo = this.filtroMetodoPago();

    return this.todasVentasMesConAnuladas().filter(v => {
      const matchMetodo = metodo === 'Todos' || (v.metodoPago || v.metodo_pago) === metodo;
      const matchTexto =
        !texto ||
        (v.id || '').toLowerCase().includes(texto) ||
        (v.cliente || '').toLowerCase().includes(texto) ||
        (v.vendedor || '').toLowerCase().includes(texto);
      return matchMetodo && matchTexto;
    });
  });
}

