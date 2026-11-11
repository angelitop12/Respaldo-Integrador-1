import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Mapeo } from './mapeo';

describe('Mapeo', () => {
  let fixture: ComponentFixture<Mapeo>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Mapeo],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(Mapeo);
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
