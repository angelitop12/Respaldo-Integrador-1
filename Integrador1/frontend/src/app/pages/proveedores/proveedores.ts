import { Component, OnInit, computed, inject, signal, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Proveedor } from '../../models';
import { Confirmar } from '../../services/confirmar';
import { Toast } from '../../services/toast';
import { Icono } from '../../ui/icono/icono';
import { Modal } from '../../ui/modal/modal';
import { Vacio } from '../../ui/vacio/vacio';

const FORM_VACIO = () => ({ empresa: '', contacto: '', telefono: '', email: '', productos: '' });

@Component({
  selector: 'app-proveedores',
  imports: [FormsModule, Icono, Modal, Vacio],
  templateUrl: './proveedores.html',
  styleUrl: './proveedores.css',
})
export class Proveedores implements OnInit {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  private toast = inject(Toast);
  private confirmar = inject(Confirmar);

  private apiUrl = 'http://localhost:3000/api/proveedores';

  proveedores = signal<Proveedor[]>([]);
  busqueda = signal('');

  filtrados = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    return this.proveedores().filter(
      p => !q || [p.empresa || '', p.contacto || '', p.productos || ''].some(t => t.toLowerCase().includes(q))
    );
  });

  modalAbierto = signal(false);
  editandoId = signal<number | null>(null);
  form = FORM_VACIO();
  errorForm = signal('');

  ngOnInit() {
    this.cargarProveedoresMunoz();
  }

  cargarProveedoresMunoz() {
    this.http.get<any[]>(this.apiUrl).subscribe({
      next: (datos) => {
        const lista: Proveedor[] = (datos || []).map(p => ({
          id: p.id,
          empresa: p.empresa || '',
          contacto: p.contacto || '',
          telefono: p.telefono || '',
          email: p.email || '',
          productos: p.productos || '',
          activo: p.activo !== undefined ? Boolean(p.activo) : true
        }));
        this.proveedores.set(lista);
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar proveedores:', err);
        this.toast.error('No se pudo cargar la lista de proveedores');
      }
    });
  }

  abrirNuevo() {
    this.editandoId.set(null);
    this.form = FORM_VACIO();
    this.errorForm.set('');
    this.modalAbierto.set(true);
  }

  abrirEditar(p: Proveedor) {
    this.editandoId.set(p.id);
    this.form = {
      empresa: p.empresa || '',
      contacto: p.contacto || '',
      telefono: p.telefono || '',
      email: p.email || '',
      productos: p.productos || ''
    };
    this.errorForm.set('');
    this.modalAbierto.set(true);
  }

  guardar() {
    const f = this.form;
    if (!f.empresa.trim()) return this.errorForm.set('Escribe el nombre de la empresa');
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) {
      return this.errorForm.set('Ese correo no parece válido');
    }

    const datos = {
      empresa: f.empresa.trim(),
      contacto: f.contacto.trim(),
      telefono: f.telefono.trim(),
      email: f.email.trim(),
      productos: f.productos.trim(),
    };

    const id = this.editandoId();

    if (id === null) {
      this.http.post<any>(this.apiUrl, datos).subscribe({
        next: () => {
          this.cargarProveedoresMunoz();
          this.toast.ok('Proveedor agregado en la base de datos');
          this.modalAbierto.set(false);
        },
        error: () => this.toast.error('Error al registrar el proveedor')
      });
    } else {
      this.http.put<any>(`${this.apiUrl}/${id}`, datos).subscribe({
        next: () => {
          this.cargarProveedoresMunoz();
          this.toast.ok('Cambios guardados');
          this.modalAbierto.set(false);
        },
        error: () => this.toast.error('Error al actualizar el proveedor')
      });
    }
  }

  cambiarEstado(p: Proveedor) {
    const nuevoEstado = !p.activo;
    this.proveedores.update(l => l.map(x => (x.id === p.id ? { ...x, activo: nuevoEstado } : x)));

    this.http.put<any>(`${this.apiUrl}/${p.id}`, { ...p, activo: nuevoEstado }).subscribe({
      error: () => {
        this.toast.error('No se pudo actualizar el estado');
        this.proveedores.update(l => l.map(x => (x.id === p.id ? { ...x, activo: p.activo } : x)));
      }
    });
  }

  async eliminar(p: Proveedor) {
    const si = await this.confirmar.pedir({
      titulo: 'Eliminar proveedor',
      texto: `Se quitará a ${p.empresa} de tu lista.`
    });
    if (!si) return;

    this.http.delete<any>(`${this.apiUrl}/${p.id}`).subscribe({
      next: () => {
        this.proveedores.update(l => l.filter(x => x.id !== p.id));
        this.toast.info('Proveedor eliminado');
      },
      error: (err) => {
        const msg = err.error?.error || 'No se puede eliminar porque tiene compras asociadas';
        this.toast.error(msg);
      }
    });
  }
}