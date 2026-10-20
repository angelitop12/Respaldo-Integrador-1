import { Component, OnInit, computed, inject, signal, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { formatoFecha } from '../../datos-demo';
import { Reporte } from '../../models';
import { Almacen } from '../../services/almacen';
import { Confirmar } from '../../services/confirmar';
import { Toast } from '../../services/toast';
import { Icono } from '../../ui/icono/icono';
import { Modal } from '../../ui/modal/modal';
import { Vacio } from '../../ui/vacio/vacio';

type Estado = Reporte['estado'];

@Component({
  selector: 'app-reportes',
  imports: [FormsModule, Icono, Modal, Vacio],
  templateUrl: './reportes.html',
  styleUrl: './reportes.css',
})
export class Reportes implements OnInit {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  private almacen = inject(Almacen);
  private toast = inject(Toast);
  private confirmar = inject(Confirmar);

  private apiUrl = 'http://localhost:3000/api/reportes';

  reportes = signal<Reporte[]>([]);

  estados: Estado[] = ['Pendiente', 'En revisión', 'Resuelto'];
  categorias = ['Incidencia', 'Sugerencia', 'Stock', 'Otro'];

  filtro = signal<'Todos' | Estado>('Todos');
  abierto = signal<number | null>(null);

  ordenados = computed(() => [...this.reportes()].sort((a, b) => b.id - a.id));
  filtrados = computed(() => this.ordenados().filter(r => this.filtro() === 'Todos' || r.estado === this.filtro()));
  cuantos = (e: Estado) => this.reportes().filter(r => r.estado === e).length;
  total = computed(() => this.reportes().length);

  modalAbierto = signal(false);
  form = { titulo: '', categoria: 'Incidencia', descripcion: '' };
  errorForm = signal('');

  ngOnInit() {
    this.cargarReportesMunoz();
  }

  cargarReportesMunoz() {
    this.http.get<Reporte[]>(this.apiUrl).subscribe({
      next: (datos) => {
        this.reportes.set(datos || []);
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar reportes:', err);
        this.toast.error('No se pudieron cargar los reportes');
      }
    });
  }

  clase(e: Estado): string {
    return e === 'Resuelto' ? 'insignia-ok' : e === 'En revisión' ? '' : 'insignia-aviso';
  }

  alternar(id: number) {
    this.abierto.set(this.abierto() === id ? null : id);
  }

  abrir() {
    this.form = { titulo: '', categoria: 'Incidencia', descripcion: '' };
    this.errorForm.set('');
    this.modalAbierto.set(true);
  }

  guardar() {
    if (!this.form.titulo.trim()) return this.errorForm.set('Ponle un título al reporte');
    if (!this.form.descripcion.trim()) return this.errorForm.set('Cuéntanos qué pasó');

    const payload = {
      titulo: this.form.titulo.trim(),
      autor: this.almacen.perfil().nombre || 'Angel Muñoz',
      categoria: this.form.categoria,
      descripcion: this.form.descripcion.trim(),
      fecha: formatoFecha(Date.now()),
      estado: 'Pendiente'
    };

    this.http.post<Reporte>(this.apiUrl, payload).subscribe({
      next: (creado) => {
        this.cargarReportesMunoz();
        this.abierto.set(creado.id);
        this.modalAbierto.set(false);
        this.toast.ok('Reporte enviado a la base de datos');
      },
      error: () => this.toast.error('No se pudo guardar el reporte')
    });
  }

  cambiarEstado(r: Reporte, estado: Estado) {
    // Actualización inmediata para que el usuario no espere
    this.reportes.update(l => l.map(x => (x.id === r.id ? { ...x, estado } : x)));

    this.http.put(`${this.apiUrl}/${r.id}`, { estado }).subscribe({
      next: () => this.toast.info('Estado actualizado a: ' + estado),
      error: () => {
        this.toast.error('Error al actualizar el estado en BD');
        this.cargarReportesMunoz(); // Revertir en caso de fallo
      }
    });
  }

  async eliminar(r: Reporte) {
    const si = await this.confirmar.pedir({ titulo: 'Eliminar reporte', texto: `Se borrará «${r.titulo}».` });
    if (!si) return;

    this.http.delete(`${this.apiUrl}/${r.id}`).subscribe({
      next: () => {
        this.reportes.update(l => l.filter(x => x.id !== r.id));
        this.toast.info('Reporte eliminado de la base de datos');
      },
      error: () => this.toast.error('No se pudo eliminar el reporte')
    });
  }
}