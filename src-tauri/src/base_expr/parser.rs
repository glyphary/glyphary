//! Tokenizer and Pratt parser for the Bases expression grammar.
//!
//! Responsibilities:
//! - Turn source text into `Expr`: literals, identifiers, member and index
//!   access, calls, unary and binary operators, list and object literals.
//!
//! Contracts:
//! - Precedence follows JavaScript: `||` < `&&` < equality < comparison <
//!   additive < multiplicative < unary < postfix.
//! - Regular expression literals are rejected with a clear error.
use super::Value;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum BinOp {
    Add,
    Sub,
    Mul,
    Div,
    Rem,
    Eq,
    Ne,
    Lt,
    Gt,
    Le,
    Ge,
    And,
    Or,
}

#[derive(Clone, Debug)]
pub(crate) enum Expr {
    Lit(Value),
    Ident(String),
    Member(Box<Expr>, String),
    Index(Box<Expr>, Box<Expr>),
    Call(Box<Expr>, Vec<Expr>),
    Not(Box<Expr>),
    Neg(Box<Expr>),
    Bin(BinOp, Box<Expr>, Box<Expr>),
    ListLit(Vec<Expr>),
    ObjectLit(Vec<(String, Expr)>),
}

#[derive(Clone, Debug, PartialEq)]
enum Token {
    Num(f64),
    Str(String),
    Ident(String),
    Op(&'static str),
}

// Longest operators first so `<=` is not read as `<` followed by `=`.
const OPERATORS: [&str; 23] = [
    "&&", "||", "==", "!=", "<=", ">=", "(", ")", "[", "]", "{", "}", ",", ".", ":", "+", "-",
    "*", "/", "%", "!", "<", ">",
];

fn tokenize(source: &str) -> Result<Vec<Token>, String> {
    let chars: Vec<char> = source.chars().collect();
    let mut tokens = Vec::new();
    let mut index = 0;

    while index < chars.len() {
        let character = chars[index];

        if character.is_whitespace() {
            index += 1;
            continue;
        }

        if character == '"' || character == '\'' {
            let quote = character;
            let mut text = String::new();
            index += 1;
            loop {
                let Some(&next) = chars.get(index) else {
                    return Err("Unterminated string".into());
                };
                index += 1;
                if next == quote {
                    break;
                }
                if next == '\\' {
                    let Some(&escaped) = chars.get(index) else {
                        return Err("Unterminated string".into());
                    };
                    index += 1;
                    text.push(match escaped {
                        'n' => '\n',
                        't' => '\t',
                        other => other,
                    });
                    continue;
                }
                text.push(next);
            }
            tokens.push(Token::Str(text));
            continue;
        }

        if character.is_ascii_digit()
            || (character == '.' && chars.get(index + 1).is_some_and(char::is_ascii_digit))
        {
            let start = index;
            while index < chars.len() && (chars[index].is_ascii_digit() || chars[index] == '.') {
                index += 1;
            }
            let text: String = chars[start..index].iter().collect();
            tokens.push(Token::Num(
                text.parse()
                    .map_err(|_| format!("Invalid number `{text}`"))?,
            ));
            continue;
        }

        if character.is_alphabetic() || character == '_' || character == '$' {
            let start = index;
            while index < chars.len()
                && (chars[index].is_alphanumeric() || chars[index] == '_' || chars[index] == '$')
            {
                index += 1;
            }
            tokens.push(Token::Ident(chars[start..index].iter().collect()));
            continue;
        }

        // A `/` where an operand is expected can only start a regex literal.
        if character == '/' && expects_operand(tokens.last()) {
            return Err("Regular expression literals are not supported".into());
        }

        let rest: String = chars[index..(index + 2).min(chars.len())].iter().collect();
        let Some(op) = OPERATORS.iter().find(|op| rest.starts_with(**op)) else {
            return Err(format!("Unexpected character `{character}`"));
        };
        tokens.push(Token::Op(op));
        index += op.len();
    }

    Ok(tokens)
}

fn expects_operand(previous: Option<&Token>) -> bool {
    match previous {
        None => true,
        Some(Token::Op(op)) => !matches!(*op, ")" | "]" | "}"),
        _ => false,
    }
}

struct Parser {
    tokens: Vec<Token>,
    position: usize,
}

pub(crate) fn parse(source: &str) -> Result<Expr, String> {
    let mut parser = Parser {
        tokens: tokenize(source)?,
        position: 0,
    };

    if parser.tokens.is_empty() {
        return Err("Empty expression".into());
    }

    let expr = parser.expression(0)?;

    if parser.position < parser.tokens.len() {
        return Err(format!("Unexpected `{}`", parser.describe(parser.position)));
    }

    Ok(expr)
}

impl Parser {
    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.position)
    }

    fn describe(&self, position: usize) -> String {
        match self.tokens.get(position) {
            Some(Token::Num(number)) => number.to_string(),
            Some(Token::Str(text)) => format!("\"{text}\""),
            Some(Token::Ident(name)) => name.clone(),
            Some(Token::Op(op)) => (*op).to_string(),
            None => "end of expression".into(),
        }
    }

    fn take_op(&mut self, op: &str) -> bool {
        if matches!(self.peek(), Some(Token::Op(found)) if *found == op) {
            self.position += 1;
            true
        } else {
            false
        }
    }

    fn expect_op(&mut self, op: &str) -> Result<(), String> {
        if self.take_op(op) {
            Ok(())
        } else {
            Err(format!(
                "Expected `{op}` but found `{}`",
                self.describe(self.position)
            ))
        }
    }

    fn expression(&mut self, min_precedence: u8) -> Result<Expr, String> {
        let mut left = self.unary()?;

        loop {
            let Some(Token::Op(op)) = self.peek() else {
                break;
            };
            let Some((binop, precedence)) = binary_operator(op) else {
                break;
            };

            if precedence < min_precedence {
                break;
            }

            self.position += 1;
            let right = self.expression(precedence + 1)?;
            left = Expr::Bin(binop, Box::new(left), Box::new(right));
        }

        Ok(left)
    }

    fn unary(&mut self) -> Result<Expr, String> {
        if self.take_op("!") {
            return Ok(Expr::Not(Box::new(self.unary()?)));
        }

        if self.take_op("-") {
            return Ok(Expr::Neg(Box::new(self.unary()?)));
        }

        self.postfix()
    }

    fn postfix(&mut self) -> Result<Expr, String> {
        let mut expr = self.primary()?;

        loop {
            if self.take_op(".") {
                let Some(Token::Ident(name)) = self.peek().cloned() else {
                    return Err(format!(
                        "Expected a name after `.` but found `{}`",
                        self.describe(self.position)
                    ));
                };
                self.position += 1;
                expr = Expr::Member(Box::new(expr), name);
            } else if self.take_op("(") {
                let args = self.arguments(")")?;
                expr = Expr::Call(Box::new(expr), args);
            } else if self.take_op("[") {
                let index = self.expression(0)?;
                self.expect_op("]")?;
                expr = Expr::Index(Box::new(expr), Box::new(index));
            } else {
                return Ok(expr);
            }
        }
    }

    fn arguments(&mut self, closer: &str) -> Result<Vec<Expr>, String> {
        let mut args = Vec::new();

        if self.take_op(closer) {
            return Ok(args);
        }

        loop {
            args.push(self.expression(0)?);
            if self.take_op(closer) {
                return Ok(args);
            }
            self.expect_op(",")?;
        }
    }

    fn primary(&mut self) -> Result<Expr, String> {
        let token = self.peek().cloned();
        self.position += 1;

        match token {
            Some(Token::Num(number)) => Ok(Expr::Lit(Value::Number(number))),
            Some(Token::Str(text)) => Ok(Expr::Lit(Value::Str(text))),
            Some(Token::Ident(name)) => Ok(match name.as_str() {
                "true" => Expr::Lit(Value::Bool(true)),
                "false" => Expr::Lit(Value::Bool(false)),
                "null" => Expr::Lit(Value::Null),
                _ => Expr::Ident(name),
            }),
            Some(Token::Op("(")) => {
                let inner = self.expression(0)?;
                self.expect_op(")")?;
                Ok(inner)
            }
            Some(Token::Op("[")) => Ok(Expr::ListLit(self.arguments("]")?)),
            Some(Token::Op("{")) => {
                let mut entries = Vec::new();
                if self.take_op("}") {
                    return Ok(Expr::ObjectLit(entries));
                }
                loop {
                    let key = match self.peek().cloned() {
                        Some(Token::Str(text)) | Some(Token::Ident(text)) => text,
                        _ => {
                            return Err(format!(
                                "Expected an object key but found `{}`",
                                self.describe(self.position)
                            ))
                        }
                    };
                    self.position += 1;
                    self.expect_op(":")?;
                    entries.push((key, self.expression(0)?));
                    if self.take_op("}") {
                        return Ok(Expr::ObjectLit(entries));
                    }
                    self.expect_op(",")?;
                }
            }
            _ => Err(format!(
                "Unexpected `{}`",
                self.describe(self.position - 1)
            )),
        }
    }
}

fn binary_operator(op: &str) -> Option<(BinOp, u8)> {
    Some(match op {
        "||" => (BinOp::Or, 1),
        "&&" => (BinOp::And, 2),
        "==" => (BinOp::Eq, 3),
        "!=" => (BinOp::Ne, 3),
        "<" => (BinOp::Lt, 4),
        ">" => (BinOp::Gt, 4),
        "<=" => (BinOp::Le, 4),
        ">=" => (BinOp::Ge, 4),
        "+" => (BinOp::Add, 5),
        "-" => (BinOp::Sub, 5),
        "*" => (BinOp::Mul, 6),
        "/" => (BinOp::Div, 6),
        "%" => (BinOp::Rem, 6),
        _ => return None,
    })
}

