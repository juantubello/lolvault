export class CompactFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompactFormatError';
  }
}

type ClassDefinitions = Map<string, string[]>;

function splitDefinitions(text: string): {
  definitions: ClassDefinitions;
  valueText: string;
} {
  const definitions: ClassDefinitions = new Map();
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  let valueStart = lines.length;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? '';
    if (line === '') continue;

    if (!line.startsWith('class ')) {
      valueStart = index;
      break;
    }

    const match = /^class\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line);
    if (!match) {
      throw new CompactFormatError(`Definición de clase inválida en la línea ${index + 1}`);
    }

    const [, className, rawFields] = match;
    if (className === undefined || rawFields === undefined) {
      throw new CompactFormatError(`Definición de clase inválida en la línea ${index + 1}`);
    }
    if (definitions.has(className)) {
      throw new CompactFormatError(`La clase ${className} está definida más de una vez`);
    }

    const fields = rawFields.trim() === ''
      ? []
      : rawFields.split(',').map((field) => field.trim());
    if (fields.some((field) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(field))) {
      throw new CompactFormatError(`Campos inválidos para la clase ${className}`);
    }
    definitions.set(className, fields);
  }

  return {
    definitions,
    valueText: lines.slice(valueStart).join('\n').trim(),
  };
}

class ValueParser {
  private position = 0;

  constructor(
    private readonly source: string,
    private readonly definitions: ClassDefinitions,
  ) {}

  parse(): unknown {
    if (this.source === '') this.fail('Falta el valor compacto');
    const value = this.parseValue();
    this.skipWhitespace();
    if (this.position !== this.source.length) {
      this.fail(`Token inesperado ${this.describeCurrent()}`);
    }
    return value;
  }

  private parseValue(): unknown {
    this.skipWhitespace();
    const character = this.source[this.position];

    if (character === '"') return this.parseString();
    if (character === '[') return this.parseList();
    if (character === '-' || (character !== undefined && /[0-9]/.test(character))) {
      return this.parseNumber();
    }
    if (character !== undefined && /[A-Za-z_]/.test(character)) {
      return this.parseIdentifierValue();
    }

    this.fail(`Token inesperado ${this.describeCurrent()}`);
  }

  private parseString(): string {
    this.position += 1;
    let result = '';

    while (this.position < this.source.length) {
      const character = this.source[this.position];
      this.position += 1;

      if (character === '"') return result;
      if (character !== '\\') {
        result += character;
        continue;
      }

      const escaped = this.source[this.position];
      this.position += 1;
      switch (escaped) {
        case '"': result += '"'; break;
        case '\\': result += '\\'; break;
        case '/': result += '/'; break;
        case 'b': result += '\b'; break;
        case 'f': result += '\f'; break;
        case 'n': result += '\n'; break;
        case 'r': result += '\r'; break;
        case 't': result += '\t'; break;
        case 'u': {
          const hexadecimal = this.source.slice(this.position, this.position + 4);
          if (!/^[0-9A-Fa-f]{4}$/.test(hexadecimal)) {
            this.fail('Escape Unicode inválido');
          }
          result += String.fromCharCode(Number.parseInt(hexadecimal, 16));
          this.position += 4;
          break;
        }
        default:
          this.fail(`Escape inválido \\${escaped ?? ''}`);
      }
    }

    this.fail('String sin cerrar');
  }

  private parseNumber(): number {
    const remainder = this.source.slice(this.position);
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(remainder);
    if (!match) this.fail('Número inválido');

    const rawNumber = match[0];
    this.position += rawNumber.length;
    const value = Number(rawNumber);
    if (!Number.isFinite(value)) this.fail(`Número fuera de rango: ${rawNumber}`);
    return value;
  }

  private parseList(): unknown[] {
    this.expect('[');
    const values: unknown[] = [];
    this.skipWhitespace();
    if (this.consume(']')) return values;

    while (true) {
      values.push(this.parseValue());
      this.skipWhitespace();
      if (this.consume(']')) return values;
      this.expect(',');
    }
  }

  private parseIdentifierValue(): unknown {
    const className = this.readIdentifier();
    if (className === 'true') return true;
    if (className === 'false') return false;
    if (className === 'null') return null;

    const fields = this.definitions.get(className);
    if (!fields) this.fail(`Clase desconocida: ${className}`);

    this.skipWhitespace();
    this.expect('(');
    const values: unknown[] = [];
    this.skipWhitespace();

    if (!this.consume(')')) {
      while (true) {
        values.push(this.parseValue());
        this.skipWhitespace();
        if (this.consume(')')) break;
        this.expect(',');
      }
    }

    if (values.length !== fields.length) {
      this.fail(
        `Cantidad de valores inválida para ${className}: se esperaban ${fields.length} y llegaron ${values.length}`,
      );
    }

    return Object.fromEntries(fields.map((field, index) => [field, values[index]]));
  }

  private readIdentifier(): string {
    const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.source.slice(this.position));
    if (!match) this.fail(`Token inesperado ${this.describeCurrent()}`);
    this.position += match[0].length;
    return match[0];
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.source[this.position] ?? '')) this.position += 1;
  }

  private consume(expected: string): boolean {
    if (this.source[this.position] !== expected) return false;
    this.position += 1;
    return true;
  }

  private expect(expected: string): void {
    this.skipWhitespace();
    if (!this.consume(expected)) {
      this.fail(`Se esperaba "${expected}" y se encontró ${this.describeCurrent()}`);
    }
  }

  private describeCurrent(): string {
    const character = this.source[this.position];
    return character === undefined ? 'fin de texto' : `"${character}"`;
  }

  private fail(message: string): never {
    throw new CompactFormatError(`${message} (posición ${this.position})`);
  }
}

/** Convierte la representación compacta de OP.GG en objetos y arrays comunes. */
export function parseCompact(text: string): unknown {
  const { definitions, valueText } = splitDefinitions(text);
  return new ValueParser(valueText, definitions).parse();
}
