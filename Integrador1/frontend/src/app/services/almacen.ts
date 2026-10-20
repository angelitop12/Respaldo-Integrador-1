import { Injectable, signal } from '@angular/core';
import {
  CARGAR_DATOS_DEMO, CLIENTES_DEMO, COMPRAS_DEMO, PRODUCTOS_DEMO, PROVEEDORES_DEMO, REPORTES_DEMO, VENTAS_DEMO,
} from '../datos-demo';
import { Cliente, Compra, Empresa, Perfil, Producto, Proveedor, Reporte, Venta } from '../models';

// Guarda los datos mientras la app está abierta, para que no se pierdan al cambiar de pantalla.
// Cuando conectes tu backend, aquí es donde se reemplazan por llamadas a la API.
@Injectable({ providedIn: 'root' })
export class Almacen {
  productos = signal<Producto[]>(CARGAR_DATOS_DEMO ? PRODUCTOS_DEMO : []);
  clientes = signal<Cliente[]>(CARGAR_DATOS_DEMO ? CLIENTES_DEMO : []);
  proveedores = signal<Proveedor[]>(CARGAR_DATOS_DEMO ? PROVEEDORES_DEMO : []);
  ventas = signal<Venta[]>(CARGAR_DATOS_DEMO ? VENTAS_DEMO : []);
  compras = signal<Compra[]>(CARGAR_DATOS_DEMO ? COMPRAS_DEMO : []);
  reportes = signal<Reporte[]>(CARGAR_DATOS_DEMO ? REPORTES_DEMO : []);

  empresa = signal<Empresa>({ nombre: 'Ferretería ToolStore', ruc: '', direccion: '', telefono: '', moneda: 'S/' });
  avisarStock = signal(true); // preferencia: mostrar el aviso de stock bajo en el dashboard
  perfil = signal<Perfil>({ nombre: 'Administrador', correo: '' });

  // Siguiente número libre para una lista con ids numéricos
  siguienteId(lista: { id: number }[]): number {
    return lista.reduce((mayor, x) => Math.max(mayor, x.id), 0) + 1;
  }

  // Siguiente código de venta, con el formato #000123
  siguienteCodigoVenta(): string {
    const mayor = this.ventas().reduce((m, v) => Math.max(m, Number(v.id.replace('#', '')) || 0), 100000);
    return '#' + String(mayor + 1).padStart(6, '0');
  }
}
