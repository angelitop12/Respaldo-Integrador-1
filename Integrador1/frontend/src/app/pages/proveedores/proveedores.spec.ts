import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Proveedores } from './proveedores';

describe('Proveedores', () => {
  let fixture: ComponentFixture<Proveedores>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Proveedores],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(Proveedores);
    fixture.detectChanges();
  });

  it('se crea', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('dibuja el título de la página', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1, h2')?.textContent?.trim().length).toBeGreaterThan(0);
  });
});
