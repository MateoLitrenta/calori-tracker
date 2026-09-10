const fs = require('fs');
let content = fs.readFileSync('src/components/DailyPanel.tsx', 'utf8');

content = content.replace(/bg-\\[#161b22\\]/g, (match, offset, string) => {
  const preceding = string.slice(Math.max(0, offset - 5), offset);
  if (preceding.includes('dark:')) return match;
  return 'bg-white dark:bg-[#161b22]';
});

content = content.replace(/bg-gray-900/g, (match, offset, string) => {
  const preceding = string.slice(Math.max(0, offset - 5), offset);
  if (preceding.includes('dark:')) return match;
  return 'bg-white dark:bg-[#161b22]';
});


// Comida Inputs
let comidaRegex = /className=\"w-24 bg-slate-100 dark:bg-\[\#0f141c\][^\"]*text-white[^\"]*focus:border-blue-500\"/g;
content = content.replace(comidaRegex, 'className="w-24 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"');

comidaRegex2 = /className=\"flex-1 bg-slate-100 dark:bg-\[\#0f141c\][^\"]*text-white[^\"]*focus:border-blue-500\"/g;
content = content.replace(comidaRegex2, 'className="flex-1 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"');


// Ejercicio Inputs
let ejercicioRegex = /className=\"w-24 bg-slate-100 dark:bg-\[\#0f141c\][^\"]*text-white[^\"]*focus:border-orange-500\"/g;
content = content.replace(ejercicioRegex, 'className="w-24 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500"');

ejercicioRegex2 = /className=\"flex-1 bg-slate-100 dark:bg-\[\#0f141c\][^\"]*text-white[^\"]*focus:border-orange-500\"/g;
content = content.replace(ejercicioRegex2, 'className="flex-1 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500"');

fs.writeFileSync('src/components/DailyPanel.tsx', content, 'utf8');
