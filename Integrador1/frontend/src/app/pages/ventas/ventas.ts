import { DecimalPipe } from '@angular/common';
import { Component, signal, computed, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

// Componentes y Servicios UI
import { Confirmar } from '../../services/confirmar';
import { Toast } from '../../services/toast';
import { Contador } from '../../ui/contador/contador';
import { Icono } from '../../ui/icono/icono';
import { Modal } from '../../ui/modal/modal';
import { Vacio } from '../../ui/vacio/vacio';

export interface VentaItem {
  id?: number;
  producto_id?: number;
  producto: string;
  cantidad: number;
  precio: number;
  subtotal: number;
}

export interface Venta {
  id: string;
  fecha: string;
  hora: string;
  cliente: string;
  vendedor: string;
  metodoPago: string;
  total: number;
  estado?: string;
  items?: VentaItem[];
}

export interface ProductoCart {
  producto_id: number;
  nombre: string;
  cantidad: number;
  precio: number;
}

@Component({
  selector: 'app-ventas',
  imports: [DecimalPipe, FormsModule, Contador, Icono, Modal, Vacio],
  templateUrl: './ventas.html',
  styleUrl: './ventas.css',
})
export class Ventas implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(Toast);
  private confirmar = inject(Confirmar);

  // --- ESTADOS DE BASE DE DATOS (MUÑOZ) ---
  ventas = signal<Venta[]>([]);
  productos = signal<any[]>([]); 
  carrito = signal<ProductoCart[]>([]); 
  modalAbierto = signal(false);

  // Fila expandida en la tabla de ventas
  filaExpandidaId = signal<string | null>(null);

  alternarFila(id: string) {
    this.filaExpandidaId.update(actual => (actual === id ? null : id));
  }

  // --- ESTADOS DE UI (COMPAÑERO) ---
  metodo = signal('Todos');
  busqueda = signal('');

  // --- FORMULARIOS ---
  form = { cliente: '', vendedor: '', metodoPago: 'Efectivo' };
  formProducto = { id: '', cantidad: 1 }; 

  // --- COMPUTADOS ---
  // Solo se suman ventas vigentes (excluyendo ANULADA)
  totalAcumulado = computed(() => 
    this.ventas()
      .filter(v => v.estado !== 'ANULADA')
      .reduce((s, v) => s + v.total, 0)
  );

  totalCarrito = computed(() => this.carrito().reduce((s, item) => s + (item.cantidad * item.precio), 0));

  // Ordenación segura por ID numérico descendente
  ordenadas = computed(() => {
    return [...this.ventas()].sort((a, b) => 
      Number(b.id?.replace(/\D/g, '') || 0) - Number(a.id?.replace(/\D/g, '') || 0)
    );
  });

  filtradas = computed(() => {
    const t = this.busqueda().toLowerCase().trim();
    return this.ordenadas().filter(v =>
      (this.metodo() === 'Todos' || v.metodoPago === this.metodo()) &&
      (t === '' || v.cliente.toLowerCase().includes(t) || v.id.toLowerCase().includes(t))
    );
  });

  // --- CICLO DE VIDA ---
  ngOnInit() {
    this.cargarVentasMunoz();
    this.cargarInventarioMunoz(); 
  }

  // --- LÓGICA DE BASE DE DATOS (MUÑOZ) ---
  cargarVentasMunoz() {
    this.http.get<any[]>('http://localhost:3000/api/ventas').subscribe({
      next: (datos) => {
        const ventasFormateadas = datos.map(v => ({ ...v, total: Number(v.total) }));
        this.ventas.set(ventasFormateadas);
      },
      error: (err) => console.error('Error al cargar ventas:', err)
    });
  }

  cargarInventarioMunoz() {
    this.http.get<any[]>('http://localhost:3000/api/inventario').subscribe({
      next: (datos) => this.productos.set(datos),
      error: (err) => console.error('Error al cargar inventario para el POS:', err)
    });
  }

  abrirNueva() {
    this.form = { cliente: '', vendedor: '', metodoPago: 'Efectivo' };
    this.carrito.set([]); 
    this.formProducto = { id: '', cantidad: 1 };
    this.modalAbierto.set(true);
  }

  // Puente para que los botones del compañero funcionen con tu lógica
  abrir() { this.abrirNueva(); }
  guardar() { this.registrarVentaMunoz(); }

  agregarAlCarritoMunoz() {
    if (!this.formProducto.id || this.formProducto.cantidad <= 0) return;
    
    const prod = this.productos().find(p => p.id === Number(this.formProducto.id));
    if (!prod) return;

    if (this.formProducto.cantidad > prod.stock) {
      this.toast.error(`Stock insuficiente. Solo quedan ${prod.stock} ${prod.unidad || 'und'} de ${prod.nombre}.`);
      return;
    }

    const item: ProductoCart = {
      producto_id: prod.id,
      nombre: prod.nombre,
      cantidad: this.formProducto.cantidad,
      precio: Number(prod.precio)
    };

    const existe = this.carrito().find(c => c.producto_id === item.producto_id);
    if (existe) {
      if (existe.cantidad + item.cantidad > prod.stock) {
        this.toast.error('No hay suficiente stock para agregar más a la venta.');
        return;
      }
      this.carrito.update(lista => lista.map(c => 
        c.producto_id === item.producto_id ? { ...c, cantidad: c.cantidad + item.cantidad } : c
      ));
    } else {
      this.carrito.update(lista => [...lista, item]);
    }
    
    this.toast.ok(`Agregado: ${prod.nombre}`);
    this.formProducto = { id: '', cantidad: 1 };
  }

  eliminarDelCarrito(id: number) {
    this.carrito.update(lista => lista.filter(c => c.producto_id !== id));
  }

  registrarVentaMunoz() {
    if (!this.form.cliente.trim() || !this.form.vendedor.trim() || this.carrito().length === 0) {
      this.toast.error('Completa el cliente, vendedor y agrega al menos un producto al carrito.');
      return;
    }

    const payload = {
      ...this.form,
      total: this.totalCarrito(), 
      carrito: this.carrito()     
    };

    this.http.post<any>('http://localhost:3000/api/ventas', payload).subscribe({
      next: (respuesta) => {
        this.toast.ok(respuesta.mensaje || 'Venta registrada con éxito');
        this.cargarVentasMunoz(); 
        this.cargarInventarioMunoz(); 
        this.modalAbierto.set(false);
      },
      error: (err) => {
        const msg = err.error?.error || 'Hubo un error al registrar la venta. Posible falta de stock en BD.';
        this.toast.error(msg);
      }
    });
  }

  async eliminar(id: string) {
    const si = await this.confirmar.pedir({
      titulo: 'Anular venta',
      texto: `¿Estás seguro de anular la venta ${id}? Las unidades retornarán automáticamente al inventario.`
    });
    if (!si) return;

    this.http.put(`http://localhost:3000/api/ventas/${encodeURIComponent(id)}/anular`, {}).subscribe({
      next: () => {
        this.toast.ok(`Venta ${id} anulada y stock devuelto`);
        // Actualizamos estado en la lista visual
        this.ventas.update(l => l.map(v => v.id === id ? { ...v, estado: 'ANULADA' } : v));
        this.cargarInventarioMunoz(); 
      },
      error: () => this.toast.error('Hubo un error al intentar anular el comprobante.')
    });
  }
}