import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

// Componentes y Servicios UI
import { Confirmar } from '../../services/confirmar';
import { Toast } from '../../services/toast';
import { Icono } from '../../ui/icono/icono';
import { Modal } from '../../ui/modal/modal';
import { Vacio } from '../../ui/vacio/vacio';

export interface Producto {
  id: number;
  nombre: string;
  categoria: string;
  unidad: string;
  stock: number;
  stockMinimo: number;
  precio: number;
  precioCompra?: number;
  codigoBarras?: string;
  estado_stock?: string;
}

const FORM_VACIO = (): any => ({ nombre: '', categoria: '', unidad: 'und', stock: null, stockMinimo: null, precio: null });

@Component({
  selector: 'app-inventario',
  imports: [DecimalPipe, FormsModule, Icono, Modal, Vacio],
  templateUrl: './inventario.html',
  styleUrl: './inventario.css',
})
export class Inventario implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(Toast);
  private confirmar = inject(Confirmar);

  moneda = signal('S/');
  productos = signal<Producto[]>([]);
  busqueda = signal('');
  categoria = signal('Todas');
  soloBajo = signal(false);

  modalAbierto = signal(false);
  editandoId = signal<number | null>(null);
  form: any = FORM_VACIO();
  errorForm = signal('');

  // Categorías persistentes de la base de datos
  categoriasBD = signal<string[]>([]);
  modalCategoriaAbierto = signal(false);
  formCategoria = { nombre: '', descripcion: '' };
  errorCategoria = signal('');

  categorias = computed(() => {
    const fromProds = this.productos().map(p => p.categoria).filter(Boolean);
    const fromBD = this.categoriasBD();
    return [...new Set([...fromBD, ...fromProds])].sort();
  });

  // El HTML del compañero esperaba "filtrados" (masculino) y la variable "categoria"
  filtrados = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    const cat = this.categoria();
    return this.productos().filter(p => {
      const matchCat = cat === 'Todas' || p.categoria === cat;
      const matchBajo = !this.soloBajo() || this.estado(p) === 'bajo';
      const matchText = !q || p.nombre.toLowerCase().includes(q) || p.categoria.toLowerCase().includes(q);
      return matchCat && matchBajo && matchText;
    });
  });

  cantidadBajo = computed(() => this.productos().filter(p => this.estado(p) === 'bajo').length);

  ngOnInit() {
    this.cargarInventarioMunoz();
    this.cargarCategorias();
  }

  cargarCategorias() {
    this.http.get<any[]>('http://localhost:3000/api/categorias').subscribe({
      next: (cats) => {
        if (Array.isArray(cats)) {
          this.categoriasBD.set(cats.map(c => c.nombre).filter(Boolean));
        }
      },
      error: (err) => console.error('Error al cargar categorías:', err)
    });
  }

  cargarInventarioMunoz() {
    this.http.get<Producto[]>('http://localhost:3000/api/inventario').subscribe({
      next: (datos) => {
        const datosNumericos = datos.map(p => ({
          ...p,
          stock: Number(p.stock),
          stockMinimo: Number(p.stockMinimo),
          precio: Number(p.precio)
        }));
        this.productos.set(datosNumericos);
      },
      error: (err) => console.error('Error al cargar inventario:', err)
    });
  }

  estado(p: Producto): 'bajo' | 'cerca' | 'ok' {
    if (p.stock <= p.stockMinimo) return 'bajo';
    if (p.stock <= p.stockMinimo * 1.5) return 'cerca';
    return 'ok';
  }

  nivel(p: Producto): number {
    return Math.min(100, Math.round((p.stock / Math.max(1, p.stockMinimo * 2)) * 100));
  }

  // Función que el compañero dejó en el HTML para sumar/restar stock rápido
  cambiarStock(p: Producto, delta: number) {
    const nuevo = Math.max(0, Number(p.stock) + delta);
    if (nuevo === p.stock) return;

    // 1. Actualizamos rápido en pantalla para que se sienta instantáneo
    const stockAnterior = p.stock;
    const productoActualizado = { 
      ...p, 
      stock: nuevo,
      // Mandamos ambos formatos por si tu backend espera snake_case o camelCase
      stockMinimo: p.stockMinimo,
      stock_minimo: p.stockMinimo 
    };

    this.productos.update(l => l.map(x => x.id === p.id ? productoActualizado : x));

    // 2. Enviamos el cambio real a PostgreSQL mediante tu endpoint PUT
    this.http.put<any>(`http://localhost:3000/api/inventario/${p.id}`, productoActualizado).subscribe({
      next: () => {
        // Guardado silencioso exitoso en la BD
      },
      error: (err) => {
        console.error('Error al actualizar el stock en BD:', err);
        this.toast.error('No se pudo guardar el stock en la base de datos');
        // Si falla la BD, regresamos el número a como estaba antes
        this.productos.update(l => l.map(x => x.id === p.id ? { ...x, stock: stockAnterior } : x));
      }
    });
  }
  abrirNuevo() {
    this.editandoId.set(null);
    this.form = FORM_VACIO();
    this.errorForm.set('');
    this.modalAbierto.set(true);
  }

  abrirEditar(p: Producto) {
    this.editandoId.set(p.id);
    this.form = { ...p };
    this.errorForm.set('');
    this.modalAbierto.set(true);
  }

  cerrarModal() {
    this.modalAbierto.set(false);
  }

  guardar() {
    const f = this.form;
    if (!f.nombre?.trim() || !f.categoria?.trim()) return this.errorForm.set('Escribe el nombre y la categoría');
    if (f.precio === null || f.precio < 0) return this.errorForm.set('Escribe un precio válido');
    if (f.stock === null || f.stock < 0) return this.errorForm.set('Escribe el stock actual');
    if (f.stockMinimo === null || f.stockMinimo < 0) return this.errorForm.set('Escribe el stock mínimo');

    const id = this.editandoId();
    if (id !== null) {
      this.http.put<any>(`http://localhost:3000/api/inventario/${id}`, this.form).subscribe({
        next: () => {
          this.toast.ok('Producto actualizado');
          this.cargarInventarioMunoz();
          this.cerrarModal();
        },
        error: () => this.errorForm.set('Error al actualizar en BD')
      });
    } else {
      this.http.post<any>('http://localhost:3000/api/inventario', this.form).subscribe({
        next: () => {
          this.toast.ok('Producto agregado');
          this.cargarInventarioMunoz();
          this.cerrarModal();
        },
        error: () => this.errorForm.set('Error al guardar en BD')
      });
    }
  }

  async eliminar(p: Producto) {
    const si = await this.confirmar.pedir({ titulo: 'Eliminar', texto: `Se quitará ${p.nombre}.` });
    if (!si) return;
    this.http.delete(`http://localhost:3000/api/inventario/${p.id}`).subscribe({
      next: () => {
        this.productos.update(l => l.filter(x => x.id !== p.id));
        this.toast.info('Producto eliminado de la base de datos');
      },
      error: (err: any) => {
        const msg = err.error?.error || 'No se puede eliminar porque está registrado en ventas o compras.';
        this.toast.error(msg);
      }
    });
  }

  abrirModalCategoria() {
    this.formCategoria = { nombre: '', descripcion: '' };
    this.errorCategoria.set('');
    this.modalCategoriaAbierto.set(true);
  }

  cerrarModalCategoria() {
    this.modalCategoriaAbierto.set(false);
  }

  guardarCategoria() {
    const nom = this.formCategoria.nombre.trim();
    if (!nom) {
      this.errorCategoria.set('Escribe el nombre de la categoría');
      return;
    }

    this.http.post<any>('http://localhost:3000/api/categorias', this.formCategoria).subscribe({
      next: () => {
        this.toast.ok(`Categoría "${nom}" creada correctamente`);
        if (!this.categoriasBD().includes(nom)) {
          this.categoriasBD.update(l => [...l, nom]);
        }
        // Seleccionamos la nueva categoría en el filtro de inmediato
        this.categoria.set(nom);
        this.soloBajo.set(false);
        this.cerrarModalCategoria();
      },
      error: (err) => {
        const msg = err.error?.error || 'Error al guardar la categoría';
        this.errorCategoria.set(msg);
      }
    });
  }
}