import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Icono } from '../../ui/icono/icono';
import { Regla } from '../../ui/regla/regla';
import { API } from '../../api';

// Olvidé mi contraseña: paso 1 = pedir el código, paso 2 = escribir el código y la contraseña nueva
@Component({
  selector: 'app-recuperar',
  imports: [FormsModule, Icono, Regla],
  templateUrl: './recuperar.html',
  styleUrls: ['../acceso.css'],
})
export class Recuperar {
  private router = inject(Router);
  private http = inject(HttpClient);

  paso = signal<1 | 2>(1);
  identificador = '';
  codigo = '';
  nueva = '';
  confirmar = '';
  verNueva = signal(false);
  verConfirmar = signal(false);
  error = signal('');
  aviso = signal('');
  porCorreo = signal(false);
  exito = signal(false);
  cargando = signal(false);
  sacudiendo = signal(false);

  pedirCodigo() {
    if (this.cargando()) return;
    if (!this.identificador.trim()) return this.fallar('Escribe tu usuario o tu correo');

    this.cargando.set(true);
    this.error.set('');
    this.http.post<any>(`${API}/auth/olvide-clave`, { identificador: this.identificador.trim() }).subscribe({
      next: (res) => {
        this.cargando.set(false);
        this.aviso.set(res?.mensaje || 'Se generó un código de 6 dígitos.');
        this.porCorreo.set(res?.porCorreo === true);
        this.paso.set(2);
      },
      error: (err) => {
        this.cargando.set(false);
        this.fallar(this.textoError(err, 'No se pudo generar el código'));
      }
    });
  }

  cambiarClave() {
    if (this.cargando() || this.exito()) return;
    if (!/^\d{6}$/.test(this.codigo.trim())) return this.fallar('El código tiene 6 dígitos');
    if (this.nueva.length < 6) return this.fallar('La contraseña debe tener al menos 6 caracteres');
    if (this.nueva !== this.confirmar) return this.fallar('Las contraseñas no coinciden');

    this.cargando.set(true);
    this.error.set('');
    this.http.post<any>(`${API}/auth/restablecer-clave`, {
      identificador: this.identificador.trim(),
      codigo: this.codigo.trim(),
      nueva: this.nueva
    }).subscribe({
      next: () => {
        this.cargando.set(false);
        this.exito.set(true);
        setTimeout(() => this.irALogin(), 1800);
      },
      error: (err) => {
        this.cargando.set(false);
        this.fallar(this.textoError(err, 'No se pudo cambiar la contraseña'));
      }
    });
  }

  otroCodigo() {
    this.codigo = '';
    this.error.set('');
    this.paso.set(1);
  }

  irALogin() {
    this.router.navigate(['/login']);
  }

  finAnimacion(e: AnimationEvent) {
    if (e.animationName === 'sacudir') this.sacudiendo.set(false);
  }

  private textoError(err: any, porDefecto: string): string {
    return err?.status === 0
      ? 'No se pudo conectar con el servidor. Revisa que el backend esté encendido.'
      : err?.error?.error || porDefecto;
  }

  private fallar(mensaje: string) {
    this.error.set(mensaje);
    this.sacudiendo.set(false);
    setTimeout(() => this.sacudiendo.set(true));
  }
}
