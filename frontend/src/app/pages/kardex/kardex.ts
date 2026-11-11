import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { API } from '../../api';
import { Toast } from '../../services/toast';
import { Icono } from '../../ui/icono/icono';
import { Vacio } from '../../ui/vacio/vacio';

export interface MovimientoKardex {
  id: number;
  productoId: number;
  producto: string;
  codigoInterno: string | null;
  categoria: string;
  unidad: string;
  tipo: string;
  sentido: 'ENTRADA' | 'SALIDA';
  cantidad: number;
  stockAnterior: number;
  stockPosterior: number;
  costoUnitario: number;
  costoTotal: number;
  precioUnitario: number;
  valorVenta: number | null;
  saldoValorizado: number;
  referenciaOrigen: string | null;
  referencia: string | null;
  motivo: string | null;
  usuario: string | null;
  fechaHora: string;
  fechaTxt?: string;
}

interface ProductoLista { id: number; nombre: string; }

// Nombre entendible de cada tipo de movimiento que guarda la base de datos
const TIPOS: { valor: string; texto: string }[] = [
  { valor: 'INVENTARIO_INICIAL', texto: 'Inventario inicial' },
  { valor: 'ENTRADA_COMPRA', texto: 'Compra recibida' },
  { valor: 'SALIDA_VENTA', texto: 'Venta' },
  { valor: 'AJUSTE_POSITIVO', texto: 'Ajuste (+)' },
  { valor: 'AJUSTE_NEGATIVO', texto: 'Ajuste (−)' },
  { valor: 'ANULACION_VENTA', texto: 'Venta anulada' },
  { valor: 'ANULACION_COMPRA', texto: 'Compra anulada' },
];

const LIMITE = 500;
const MONEDA = 'S/';

@Component({
  selector: 'app-kardex',
  imports: [DecimalPipe, FormsModule, RouterLink, Icono, Vacio],
  templateUrl: './kardex.html',
  styleUrl: './kardex.css',
})
export class Kardex implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(Toast);

  tipos = TIPOS;
  limite = LIMITE;
  moneda = MONEDA;
  descargando = signal(false);

  movimientos = signal<MovimientoKardex[]>([]);
  productos = signal<ProductoLista[]>([]);
  cargando = signal(true);
  fallo = signal(false);

  // Filtros (se mandan al backend)
  filtroProducto: number | '' = '';
  filtroTipo = '';
  filtroSentido: '' | 'ENTRADA' | 'SALIDA' = '';
  desde = '';
  hasta = '';
  busqueda = '';
  private reloj?: ReturnType<typeof setTimeout>;

  // Producto elegido (por el selector o haciendo clic en un producto de la tabla)
  nombreProductoElegido(): string {
    return this.filtroProducto === '' ? '' : (this.productos().find(p => p.id === this.filtroProducto)?.nombre ?? '');
  }

  // Clic en el nombre de un producto de la tabla: el Kardex pasa a mostrar solo los movimientos de ese producto
  elegirProducto(m: MovimientoKardex) {
    this.filtroProducto = m.productoId;
    this.cargar();
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  quitarProducto() {
    this.filtroProducto = '';
    this.cargar();
  }

  hayFiltros(): boolean {
    return !!(this.filtroProducto || this.filtroTipo || this.filtroSentido || this.desde || this.hasta || this.busqueda);
  }

  entradas = computed(() => this.movimientos().filter(m => m.sentido === 'ENTRADA').reduce((t, m) => t + m.cantidad, 0));
  salidas = computed(() => this.movimientos().filter(m => m.sentido === 'SALIDA').reduce((t, m) => t + m.cantidad, 0));
  // Total bruto = cantidad × costo unitario (costo FIFO), sin IGV
  totalBrutoEntradas = computed(() => this.movimientos().filter(m => m.sentido === 'ENTRADA').reduce((t, m) => t + m.costoTotal, 0));
  totalBrutoSalidas = computed(() => this.movimientos().filter(m => m.sentido === 'SALIDA').reduce((t, m) => t + m.costoTotal, 0));
  // Con un producto elegido, el último movimiento dice cuánto stock queda
  saldo(): number | null {
    return this.filtroProducto !== '' && this.movimientos().length ? this.movimientos()[0].stockPosterior : null;
  }
  // Cuánto cuesta el stock que queda del producto elegido (saldo valorizado tras su último movimiento mostrado)
  saldoValor(): number | null {
    return this.filtroProducto !== '' && this.movimientos().length ? this.movimientos()[0].saldoValorizado : null;
  }
  unidadSeleccion(): string {
    return this.filtroProducto !== '' && this.movimientos().length ? this.movimientos()[0].unidad : '';
  }

  ngOnInit() {
    this.http.get<ProductoLista[]>(`${API}/inventario`).subscribe({
      next: (datos) => this.productos.set((datos || []).map(p => ({ id: p.id, nombre: p.nombre }))),
      error: () => {}
    });
    this.cargar();
  }

  // Los mismos filtros sirven para la pantalla y para el Excel
  private parametros(): HttpParams {
    let params = new HttpParams();
    if (this.filtroProducto !== '') params = params.set('productoId', this.filtroProducto);
    if (this.filtroTipo) params = params.set('tipo', this.filtroTipo);
    if (this.filtroSentido) params = params.set('sentido', this.filtroSentido);
    if (this.desde) params = params.set('desde', this.desde);
    if (this.hasta) params = params.set('hasta', this.hasta);
    if (this.busqueda.trim()) params = params.set('q', this.busqueda.trim());
    return params;
  }

  cargar() {
    const params = this.parametros().set('limite', LIMITE);

    this.cargando.set(true);
    this.http.get<MovimientoKardex[]>(`${API}/kardex`, { params }).subscribe({
      next: (datos) => {
        this.movimientos.set((datos || []).map(m => ({ ...m, fechaTxt: this.formatoFecha(m.fechaHora) })));
        this.fallo.set(false);
        this.cargando.set(false);
      },
      error: (err) => {
        this.cargando.set(false);
        this.fallo.set(true);
        if (err.status !== 0 && err.error?.codigo !== 'SESION_INVALIDA') this.toast.error(err.error?.error || 'No se pudo cargar el kardex');
      }
    });
  }

  // Al escribir en la búsqueda se espera un momento para no consultar en cada tecla
  alEscribir() {
    clearTimeout(this.reloj);
    this.reloj = setTimeout(() => this.cargar(), 350);
  }

  elegirSentido(s: '' | 'ENTRADA' | 'SALIDA') {
    this.filtroSentido = s;
    this.cargar();
  }

  limpiar() {
    this.filtroProducto = '';
    this.filtroTipo = '';
    this.filtroSentido = '';
    this.desde = '';
    this.hasta = '';
    this.busqueda = '';
    this.cargar();
  }

  textoTipo(tipo: string): string {
    return TIPOS.find(t => t.valor === tipo)?.texto ?? tipo;
  }

  claseTipo(m: MovimientoKardex): string {
    if (m.tipo === 'ANULACION_VENTA' || m.tipo === 'ANULACION_COMPRA') return 'insignia-aviso';
    return m.sentido === 'ENTRADA' ? 'insignia-ok' : 'insignia-alerta';
  }

  // Siempre en hora de Lima, sin importar la zona horaria del computador
  private formatoFecha(iso: string): string {
    const fecha = new Date(iso);
    if (Number.isNaN(fecha.getTime())) return String(iso ?? '');
    return fecha.toLocaleString('es-PE', {
      timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  }

  // Descarga el Excel (.xlsx) del Kardex valorizado con los filtros que estén puestos.
  // Trae 2 hojas: Kardex y Lotes FIFO.
  exportarExcel() {
    if (this.descargando()) return;
    this.descargando.set(true);
    this.http.get(`${API}/kardex/excel`, { params: this.parametros(), responseType: 'blob' }).subscribe({
      next: (archivo) => {
        const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
        const enlace = document.createElement('a');
        enlace.href = URL.createObjectURL(archivo);
        enlace.download = `Kardex_valorizado_${hoy}.xlsx`;
        enlace.click();
        URL.revokeObjectURL(enlace.href);
        this.descargando.set(false);
        this.toast.ok('Excel descargado');
      },
      error: (err) => {
        this.descargando.set(false);
        if (err.status !== 0 && err.error?.codigo !== 'SESION_INVALIDA') this.toast.error('No se pudo generar el Excel del kardex');
      }
    });
  }
}
