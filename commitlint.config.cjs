// Conventional Commits en inglés; el alcance es libre (por ejemplo: feat(orders): add partial return)
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Las aplicaciones gráficas de Git no ajustan las líneas del cuerpo, así que no se limita su longitud
    'body-max-line-length': [0],
  },
};
