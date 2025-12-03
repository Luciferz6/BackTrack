import assert from 'node:assert/strict';
import {
  createBancaSchema,
  sanitizeBankroll,
  updateBancaSchema
} from '../src/routes/banca.routes.js';

async function runTests() {
  try {
    console.log('🧪 Testando validações e serialização de bancas...');

    const createPayload = {
      nome: 'Minha Banca',
      cor: '#123456',
      descricao: '  ' // Deve ser normalizado para undefined
    } as any;
    const created = createBancaSchema.parse(createPayload);

    assert.equal(created.nome, 'Minha Banca');
    assert.ok(!('cor' in created), 'Campo "cor" deve ser ignorado pelo schema de criação');
    assert.equal(created.descricao, undefined, 'Descrição vazia deve ser normalizada para undefined');

    const updatePayload = {
      nome: 'Nova Banca',
      cor: '#abcdef'
    } as any;
    const updated = updateBancaSchema.parse(updatePayload);

    assert.equal(updated.nome, 'Nova Banca');
    assert.ok(!('cor' in updated), 'Campo "cor" deve ser ignorado pelo schema de atualização');

    const sanitized = sanitizeBankroll({
      id: '1',
      nome: 'Sanitizada',
      status: 'Ativa',
      cor: '#000000'
    });
    assert.deepEqual(sanitized, { id: '1', nome: 'Sanitizada', status: 'Ativa' }, 'Serialização não deve retornar "cor"');

    const sanitizedWithMetricas = sanitizeBankroll({
      id: '2',
      nome: 'Com Métricas',
      metricas: { totalApostas: 3 },
      cor: '#ffffff'
    });
    assert.deepEqual(
      sanitizedWithMetricas,
      { id: '2', nome: 'Com Métricas', metricas: { totalApostas: 3 } },
      'Serialização deve manter métricas inalteradas'
    );

    console.log('✅ Todas as validações e serializações passaram!');
  } catch (error) {
    console.error('❌ Testes de bancas falharam:', error);
    process.exit(1);
  }
}

void runTests();
