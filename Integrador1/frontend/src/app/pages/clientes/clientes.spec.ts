import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Clientes } from './clientes';

describe('Clientes', () => {
  let fixture: ComponentFixture<Clientes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Clientes],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(Clientes);
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
