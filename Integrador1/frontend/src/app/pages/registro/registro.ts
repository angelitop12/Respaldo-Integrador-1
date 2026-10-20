import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Icono } from '../../ui/icono/icono';
import { Regla } from '../../ui/regla/regla';

@Component({
  selector: 'app-registro',
  imports: [FormsModule, Icono, Regla],
  templateUrl: './registro.html',
  styleUrls: ['../acceso.css'],
})
export class Registro {
  private router = inject(Router);
  private http = inject(HttpClient);

  nombre = '';
  correo = '';
  usuario = '';
  password = '';
  confirmarPassword = '';
  verPassword = signal(false);
  verConfirmar = signal(false);
  error = signal('');
  exito = signal(false);
  cargando = signal(false);
  sacudiendo = signal(false);

  registrar() {
    if (this.exito() || this.cargando()) return;

    if (!this.nombre.trim() || !this.correo.trim() || !this.usuario.trim() ||
        !this.password || !this.confirmarPassword) {
      return this.fallar('Completa todos los campos');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.correo)) {
      return this.fallar('Ingresa un correo válido');
    }
    if (this.password.length < 6) {
      return this.fallar('La contraseña debe tener al menos 6 caracteres');
    }
    if (this.password !== this.confirmarPassword) {
      return this.fallar('Las contraseñas no coinciden');
    }

    this.cargando.set(true);
    this.error.set('');

    this.http.post<any>('http://localhost:3000/api/auth/registro', {
      nombre: this.nombre.trim(),
      correo: this.correo.trim(),
      usuario: this.usuario.trim(),
      password: this.password
    }).subscribe({
      next: (res) => {
        this.cargando.set(false);
        if (res.ok) {
          this.error.set('');
          this.exito.set(true);
          setTimeout(() => this.irALogin(), 1800);
        } else {
          this.fallar(res.error || 'No se pudo crear la cuenta');
        }
      },
      error: (err) => {
        this.cargando.set(false);
        const mensaje = err?.error?.error || 'Error al conectar con el servidor para registrar el usuario';
        this.fallar(mensaje);
      }
    });
  }

  irALogin() {
    this.router.navigate(['/login']);
  }

  finAnimacion(e: AnimationEvent) {
    if (e.animationName === 'sacudir') this.sacudiendo.set(false);
  }

  private fallar(mensaje: string) {
    this.error.set(mensaje);
    this.sacudiendo.set(false);
    setTimeout(() => this.sacudiendo.set(true));
  }
}
