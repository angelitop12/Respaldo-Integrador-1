import { Component, OnInit, computed, inject, signal, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Proveedor } from '../../models';
import { Confirmar } from '../../services/confirmar';
import { Toast } from '../../services/toast';
import { Icono } from '../../ui/icono/icono';
import { Modal } from '../../ui/modal/modal';
import { Vacio } from '../../ui/vacio/vacio';
import { API } from '../../api';
import { Sesion } from '../../services/sesion';
import { errorRuc } from '../../utils/ruc';
import { errCorreo, errNombre, errNombrePersona, errTelefono, errTexto, primerError } from '../../utils/validaciones';


const FORM_VACIO = () => ({
  ruc: '', empresa: '', contacto: '', telefono: '', email: '', direccion: '', ciudad: '',
  condicionPago: 'CONTADO' as 'CONTADO' | 'CREDITO', diasCredito: 0, productos: ''
});

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
  sesion = inject(Sesion);

  private apiUrl = `${API}/proveedores`;

  proveedores = signal<Proveedor[]>([]);
  busqueda = signal('');

  filtrados = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    return this.proveedores().filter(
      p => !q || [p.empresa || '', p.ruc || '', p.contacto || '', p.productos || ''].some(t => t.toLowerCase().includes(q))
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
          ruc: p.ruc || '',
          empresa: p.empresa || '',
          contacto: p.contacto || '',
          telefono: p.telefono || '',
          email: p.email || '',
          direccion: p.direccion || '',
          ciudad: p.ciudad || '',
          condicionPago: p.condicionPago === 'CREDITO' ? 'CREDITO' as const : 'CONTADO' as const,
          diasCredito: Number(p.diasCredito) || 0,
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
      ruc: p.ruc || '',
      empresa: p.empresa || '',
      contacto: p.contacto || '',
      telefono: p.telefono || '',
      email: p.email || '',
      direccion: p.direccion || '',
      ciudad: p.ciudad || '',
      condicionPago: p.condicionPago === 'CREDITO' ? 'CREDITO' : 'CONTADO',
      diasCredito: p.diasCredito || 0,
      productos: p.productos || ''
    };
    this.errorForm.set('');
    this.modalAbierto.set(true);
  }

  guardar() {
    const f = this.form;
    const problemaRuc = errorRuc(f.ruc);
    if (problemaRuc) return this.errorForm.set(problemaRuc);
    const problema = primerError(
      errNombre(f.empresa, 'El nombre de la empresa', { max: 200 }),
      errNombrePersona(f.contacto, 'El contacto', { obligatorio: false }),
      errTelefono(f.telefono, 'El teléfono'),
      errCorreo(f.email, 'El correo', false),
      errTexto(f.direccion, 'La dirección', { max: 300, obligatorio: false }),
      errNombre(f.ciudad, 'La ciudad', { max: 100, obligatorio: false })
    );
    if (problema) return this.errorForm.set(problema);

    const dias = Number(f.diasCredito);
    if (f.condicionPago === 'CREDITO' && (!Number.isInteger(dias) || dias < 1 || dias > 365)) {
      return this.errorForm.set('Si es a crédito, indica los días de crédito (de 1 a 365)');
    }

    const datos = {
      ruc: f.ruc.trim(),
      empresa: f.empresa.trim(),
      contacto: f.contacto.trim(),
      telefono: f.telefono.trim(),
      email: f.email.trim(),
      direccion: f.direccion.trim(),
      ciudad: f.ciudad.trim(),
      condicionPago: f.condicionPago,
      diasCredito: f.condicionPago === 'CREDITO' ? dias : 0,
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
        error: (err) => this.errorForm.set(err.error?.error || 'Error al registrar el proveedor')
      });
    } else {
      this.http.put<any>(`${this.apiUrl}/${id}`, datos).subscribe({
        next: () => {
          this.cargarProveedoresMunoz();
          this.toast.ok('Cambios guardados');
          this.modalAbierto.set(false);
        },
        error: (err) => this.errorForm.set(err.error?.error || 'Error al actualizar el proveedor')
      });
    }
  }

  // Texto corto para la columna "Pago"
  pago(p: Proveedor): string {
    return p.condicionPago === 'CREDITO' ? `Crédito ${p.diasCredito || 0} días` : 'Contado';
  }

  cambiarEstado(p: Proveedor) {
    const nuevoEstado = !p.activo;
    this.proveedores.update(l => l.map(x => (x.id === p.id ? { ...x, activo: nuevoEstado } : x)));

    this.http.put<any>(`${this.apiUrl}/${p.id}`, { ...p, activo: nuevoEstado }).subscribe({
      error: (err) => {
        this.toast.error(err.error?.error || 'No se pudo actualizar el estado');
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