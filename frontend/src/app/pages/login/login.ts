import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Icono } from '../../ui/icono/icono';
import { Regla } from '../../ui/regla/regla';
import { Sesion } from '../../services/sesion';
import { API } from '../../api';

@Component({
  selector: 'app-login',
  imports: [FormsModule, Icono, Regla],
  templateUrl: './login.html',
  styleUrls: ['../acceso.css'],
})
export class Login {
  private router = inject(Router);
  private http = inject(HttpClient);
  private sesion = inject(Sesion);

  usuario = '';
  password = '';
  verPassword = signal(false);
  error = signal('');
  cargando = signal(false);
  sacudiendo = signal(false);

  iniciarSesion() {
    if (this.cargando()) return;

    if (!this.usuario.trim() || !this.password) {
      this.fallar('Ingresa tu usuario y contraseña');
      return;
    }

    this.cargando.set(true);
    this.error.set('');

    this.http.post<any>(`${API}/auth/login`, {
      usuario: this.usuario.trim(),
      password: this.password
    }).subscribe({
      next: (res) => {
        this.cargando.set(false);
        if (res.ok && res.usuario && res.token) {
          this.sesion.iniciar(res.usuario, res.token);
          this.error.set('');
          this.router.navigate([this.sesion.inicio()]);
        } else {
          this.fallar(res.error || 'Credenciales incorrectas');
        }
      },
      error: (err) => {
        this.cargando.set(false);
        // status 0 = no hay conexión con el backend. Ya no existe ningún acceso "de respaldo":
        // sin servidor no se puede validar la contraseña.
        const mensaje = err.status === 0
          ? 'No se pudo conectar con el servidor. Revisa que el backend esté encendido.'
          : err?.error?.error || 'Usuario o contraseña incorrectos';
        this.fallar(mensaje);
      }
    });
  }

  private fallar(msg: string) {
    this.error.set(msg);
    this.sacudiendo.set(false);
    setTimeout(() => this.sacudiendo.set(true));
  }

  irARegistro() {
    this.router.navigate(['/registro']);
  }

  irARecuperar() {
    this.router.navigate(['/recuperar']);
  }

  finAnimacion(e: AnimationEvent) {
    if (e.animationName === 'sacudir') this.sacudiendo.set(false);
  }
}
