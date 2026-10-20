import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Icono } from '../../ui/icono/icono';
import { Regla } from '../../ui/regla/regla';
import { Almacen } from '../../services/almacen';

@Component({
  selector: 'app-login',
  imports: [FormsModule, Icono, Regla],
  templateUrl: './login.html',
  styleUrls: ['../acceso.css'],
})
export class Login {
  private router = inject(Router);
  private http = inject(HttpClient);
  private almacen = inject(Almacen);

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

    this.http.post<any>('http://localhost:3000/api/auth/login', {
      usuario: this.usuario.trim(),
      password: this.password
    }).subscribe({
      next: (res) => {
        this.cargando.set(false);
        if (res.ok) {
          if (res.usuario) {
            this.almacen.perfil.set({
              nombre: res.usuario.nombre || res.usuario.nombre_completo || this.usuario.trim(),
              correo: res.usuario.email || ''
            });
          }
          this.error.set('');
          this.router.navigate(['/dashboard']);
        } else {
          this.fallar(res.error || 'Credenciales incorrectas');
        }
      },
      error: (err) => {
        this.cargando.set(false);
        // Fallback local en caso de que el backend esté desconectado
        if (this.usuario.trim() === 'admin' && this.password === '1234') {
          this.error.set('');
          this.router.navigate(['/dashboard']);
        } else {
          const mensaje = err?.error?.error || 'Usuario o contraseña incorrectos';
          this.fallar(mensaje);
        }
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

  finAnimacion(e: AnimationEvent) {
    if (e.animationName === 'sacudir') this.sacudiendo.set(false);
  }
}
