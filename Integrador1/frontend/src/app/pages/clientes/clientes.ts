import { Component, OnInit, computed, inject, signal, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Cliente } from '../../models';
import { Confirmar } from '../../services/confirmar';
import { Toast } from '../../services/toast';
import { Icono } from '../../ui/icono/icono';
import { Modal } from '../../ui/modal/modal';
import { Vacio } from '../../ui/vacio/vacio';

const FORM_VACIO = () => ({ nombre: '', telefono: '', email: '', direccion: '' });

@Component({
  selector: 'app-clientes',
  imports: [FormsModule, Icono, Modal, Vacio],
  templateUrl: './clientes.html',
  styleUrl: './clientes.css',
})
export class Clientes implements OnInit {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  private toast = inject(Toast);
  private confirmar = inject(Confirmar);

  private apiUrl = 'http://localhost:3000/api/clientes';

  clientes = signal<Cliente[]>([]);
  busqueda = signal('');

  filtrados = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    return this.clientes().filter(
      c => !q || [c.nombre || '', c.telefono || '', c.email || '', c.direccion || ''].some(t => t.toLowerCase().includes(q))
    );
  });

  activos = computed(() => this.clientes().filter(c => c.activo).length);

  modalAbierto = signal(false);
  editandoId = signal<number | null>(null);
  form = FORM_VACIO();
  errorForm = signal('');

  ngOnInit() {
    this.cargarClientesMunoz();
  }

  cargarClientesMunoz() {
    this.http.get<any[]>(this.apiUrl).subscribe({
      next: (datos) => {
        const lista: Cliente[] = (datos || []).map(c => ({
          id: c.id,
          nombre: c.nombre || '',
          telefono: c.telefono || '',
          email: c.email || '',
          direccion: c.direccion || '',
          activo: c.activo !== undefined ? Boolean(c.activo) : true
        }));
        this.clientes.set(lista);
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar clientes:', err);
        this.toast.error('No se pudo cargar la lista de clientes');
      }
    });
  }

  iniciales(nombre: string): string {
    const p = (nombre || '').trim().split(/\s+/).filter(Boolean);
    return (p.length > 1 ? p[0][0] + p[1][0] : (p[0] ?? '?').slice(0, 2)).toUpperCase();
  }

  abrirNuevo() {
    this.editandoId.set(null);
    this.form = FORM_VACIO();
    this.errorForm.set('');
    this.modalAbierto.set(true);
  }

  abrirEditar(c: Cliente) {
    this.editandoId.set(c.id);
    this.form = {
      nombre: c.nombre || '',
      telefono: c.telefono || '',
      email: c.email || '',
      direccion: c.direccion || ''
    };
    this.errorForm.set('');
    this.modalAbierto.set(true);
  }

  guardar() {
    const f = this.form;
    if (!f.nombre.trim()) return this.errorForm.set('Escribe el nombre del cliente');
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) {
      return this.errorForm.set('Ese correo no parece válido');
    }

    const datos = {
      nombre: f.nombre.trim(),
      telefono: f.telefono.trim(),
      email: f.email.trim(),
      direccion: f.direccion.trim()
    };

    const id = this.editandoId();

    if (id === null) {
      // Crear en PostgreSQL (POST)
      this.http.post<any>(this.apiUrl, datos).subscribe({
        next: (nuevo) => {
          this.cargarClientesMunoz();
          this.toast.ok('Cliente agregado en la base de datos');
          this.modalAbierto.set(false);
        },
        error: () => this.toast.error('Error al registrar el cliente')
      });
    } else {
      // Actualizar en PostgreSQL (PUT)
      this.http.put<any>(`${this.apiUrl}/${id}`, datos).subscribe({
        next: () => {
          this.cargarClientesMunoz();
          this.toast.ok('Cambios guardados');
          this.modalAbierto.set(false);
        },
        error: () => this.toast.error('Error al actualizar el cliente')
      });
    }
  }

  cambiarEstado(c: Cliente) {
    const nuevoEstado = !c.activo;
    // Actualización visual inmediata
    this.clientes.update(l => l.map(x => (x.id === c.id ? { ...x, activo: nuevoEstado } : x)));

    // Guardado en PostgreSQL
    this.http.put<any>(`${this.apiUrl}/${c.id}`, { ...c, activo: nuevoEstado }).subscribe({
      error: () => {
        this.toast.error('No se pudo actualizar el estado');
        this.clientes.update(l => l.map(x => (x.id === c.id ? { ...x, activo: c.activo } : x)));
      }
    });
  }

  async eliminar(c: Cliente) {
    const si = await this.confirmar.pedir({
      titulo: 'Eliminar cliente',
      texto: `Se quitará a ${c.nombre} de tu lista de clientes.`
    });
    if (!si) return;

    this.http.delete<any>(`${this.apiUrl}/${c.id}`).subscribe({
      next: () => {
        this.clientes.update(l => l.filter(x => x.id !== c.id));
        this.toast.info('Cliente eliminado');
      },
      error: (err) => {
        const msg = err.error?.error || 'No se puede eliminar porque tiene ventas asociadas';
        this.toast.error(msg);
      }
    });
  }
}