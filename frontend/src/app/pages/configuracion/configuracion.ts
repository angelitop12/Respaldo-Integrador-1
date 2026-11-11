import { DOCUMENT } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Almacen } from '../../services/almacen';
import { Sesion } from '../../services/sesion';
import { Tema } from '../../services/tema';
import { Toast } from '../../services/toast';
import { Icono } from '../../ui/icono/icono';
import { API } from '../../api';

@Component({
  selector: 'app-configuracion',
  imports: [FormsModule, Icono],
  templateUrl: './configuracion.html',
  styleUrl: './configuracion.css',
})
export class Configuracion implements OnInit {
  private http = inject(HttpClient);
  private almacen = inject(Almacen);
  sesion = inject(Sesion);
  private toast = inject(Toast);
  private documento = inject(DOCUMENT);
  tema = inject(Tema);

  empresa = { ...this.almacen.empresa() };
  perfil = { ...this.almacen.perfil() };
  monedas = [
    { valor: 'S/', texto: 'Soles (S/)' },
    { valor: '$', texto: 'Dólares ($)' },
  ];

  reducirMovimiento = signal(this.documento.documentElement.classList.contains('sin-movimiento'));
  avisarStock = this.almacen.avisarStock;

  clave = { actual: '', nueva: '', repetir: '' };
  errorClave = signal('');
  verClave = signal(false);

  ngOnInit() {
    // El backend sabe quién eres por el token: devuelve tu perfil y los datos de la empresa
    this.http.get<any>(`${API}/configuracion`).subscribe({
      next: (datos) => {
        if (datos?.empresa) {
          this.empresa = { ...this.empresa, ...datos.empresa };
          this.almacen.empresa.set(this.empresa);
        }
        if (datos?.perfil) {
          this.perfil = { ...this.perfil, ...datos.perfil };
          this.almacen.perfil.set(this.perfil);
        }
      },
      error: () => {}
    });
  }

  guardarEmpresa() {
    if (!this.empresa.nombre.trim()) return this.toast.error('La empresa necesita un nombre');
    const ruc = (this.empresa.ruc || '').trim();
    if (ruc && !/^\d{11}$/.test(ruc)) return this.toast.error('El RUC debe tener 11 dígitos');
    const datosGuardar = { ...this.empresa, nombre: this.empresa.nombre.trim() };
    this.almacen.empresa.set(datosGuardar);

    this.http.put(`${API}/configuracion/empresa`, datosGuardar).subscribe({
      next: () => this.toast.ok('Datos de la empresa guardados en la base de datos'),
      error: (e) => this.toast.error(e.error?.error || 'Error al guardar datos de empresa en el servidor')
    });
  }

  guardarPerfil() {
    if (!this.perfil.nombre.trim()) return this.toast.error('Escribe tu nombre');
    if (this.perfil.correo.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.perfil.correo)) {
      return this.toast.error('Ese correo no parece válido');
    }
    const datosPerfil = { nombre: this.perfil.nombre.trim(), correo: this.perfil.correo.trim() };

    this.http.put(`${API}/configuracion/perfil`, datosPerfil).subscribe({
      next: () => {
        this.sesion.actualizarPerfil(datosPerfil.nombre, datosPerfil.correo);
        this.toast.ok('Perfil actualizado en la base de datos');
      },
      error: (e) => this.toast.error(e.error?.error || 'Error al actualizar perfil en el servidor')
    });
  }

  alternarMovimiento() {
    const valor = !this.reducirMovimiento();
    this.reducirMovimiento.set(valor);
    this.documento.documentElement.classList.toggle('sin-movimiento', valor);
  }

  cambiarClave() {
    const c = this.clave;
    if (!c.actual || !c.nueva || !c.repetir) return this.errorClave.set('Completa los tres campos');
    if (c.nueva.length < 6) return this.errorClave.set('La nueva contraseña debe tener al menos 6 caracteres');
    if (c.nueva !== c.repetir) return this.errorClave.set('Las contraseñas nuevas no coinciden');
    if (c.nueva === c.actual) return this.errorClave.set('La nueva contraseña debe ser distinta a la actual');

    this.http.put(`${API}/auth/cambiar-clave`, { actual: c.actual, nueva: c.nueva }).subscribe({
      next: () => {
        this.errorClave.set('');
        this.clave = { actual: '', nueva: '', repetir: '' };
        this.toast.ok('Contraseña actualizada');
      },
      error: (e) => this.errorClave.set(e.error?.error || 'No se pudo cambiar la contraseña')
    });
  }
}
