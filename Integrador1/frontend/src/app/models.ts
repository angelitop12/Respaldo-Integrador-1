// Tipos de datos que comparten todas las pantallas.

export interface Producto {
  id: number;
  nombre: string;
  categoria: string;
  unidad: string;
  stock: number;
  stockMinimo: number;
  precio: number;
}

export interface Cliente {
  id: number; nombre: string; telefono: string; email: string; direccion: string; activo: boolean;
}

export interface Proveedor {
  id: number; empresa: string; contacto: string; telefono: string; email: string; productos: string; activo: boolean;
}

export interface Venta {
  id: string; fecha: string; hora: string;
  ts: number; // momento exacto de la venta (lo usa el dashboard)
  cliente: string; vendedor: string; metodoPago: string; total: number;
}

export interface Compra {
  id: number; proveedor: string; descripcion: string;
  cantidad: number; costoTotal: number; fecha: string;
  ts: number; // momento exacto de la compra (lo usa el dashboard)
  estado: 'Pendiente' | 'Recibido';
}

export interface Reporte {
  id: number; titulo: string; autor: string; categoria: string;
  descripcion: string; fecha: string; estado: 'Pendiente' | 'En revisión' | 'Resuelto';
}

export interface Empresa {
  nombre: string; ruc: string; direccion: string; telefono: string; moneda: string;
}

export interface Perfil {
  nombre: string; correo: string;
}
