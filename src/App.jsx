import { useState } from 'react';
import Map from "./components/Map/Map";

function App() {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh', 
      fontFamily: 'Arial, sans-serif',
      margin: 0,
      backgroundColor: '#f4f6f9'
    }}>
      
      {/* 1. HEADER (TOPO DE ACORDO COM O DESENHO) */}
      <header style={{
        height: '60px',
        backgroundColor: '#1E3A8A', // Azul escuro corporativo
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{ margin: 0, fontSize: '20px' }}>GeoSaneamento - Portal de Gestão</h1>
        
        {/* Botão pedido pelo grupo */}
        <button style={{
          backgroundColor: '#3B82F6', // Azul claro
          color: 'white',
          border: 'none',
          padding: '8px 16px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: 'bold'
        }} onClick={() => alert('Questionário aberto!')}>
          Questionário
        </button>
      </header>

      {/* ÁREA INFERIOR (BARRA LATERAL + MEIO EM BRANCO) */}
      <div style={{ display: 'flex', flex: 1 }}>
        
        {/* 2. BARRA LATERAL (SANEAMENTO) */}
        <aside style={{
          width: '280px',
          backgroundColor: 'white',
          borderRight: '1px solid #e5e7eb',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '15px'
        }}>
          <h2 style={{ fontSize: '18px', color: '#111827', margin: '0 0 10px 0' }}>Informações de Saneamento</h2>
          
          {/* Blocos de informação simulados para preencher a barra */}
          <div style={{ padding: '12px', backgroundColor: '#EFF6FF', borderRadius: '6px' }}>
            <h3 style={{ margin: '0 0 5px 0', fontSize: '14px', color: '#1E4A9A' }}>Índice de Tratamento</h3>
            <p style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>62.4%</p>
          </div>

          <div style={{ padding: '12px', backgroundColor: '#FEF3C7', borderRadius: '6px' }}>
            <h3 style={{ margin: '0 0 5px 0', fontSize: '14px', color: '#B45309' }}>Alertas de Vazamento</h3>
            <p style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>14 Ativos</p>
          </div>

          <div style={{ padding: '12px', backgroundColor: '#F3F4F6', borderRadius: '6px' }}>
            <h3 style={{ margin: '0 0 5px 0', fontSize: '14px', color: '#374151' }}>Região Monitorada</h3>
            <p style={{ margin: 0, fontSize: '14px' }}>Zona Sul e Centro Expandido</p>
          </div>
        </aside>

                {/* 3. MEIO (MAPA) */}
        <main
          style={{
            flex: 1,
            display: 'flex',
            backgroundColor: '#FFFFFF',
            position: 'relative',
            minHeight: '500px'
          }}
        >
          <div
            className="map-area"
            style={{
              width: 'calc(100% - 30px)',
              height: 'calc(100% - 30px',
              mrgin:'15px'
            }}
          >
            <Map />
          </div>
        </main>

      </div>
    </div>
  );
}

export default App;

