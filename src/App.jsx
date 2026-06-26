import React from 'react';
import { StoreProvider } from './context/StoreContext';
import Shell from './components/Shell';

function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

export default App;
