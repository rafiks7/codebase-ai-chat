const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const t = require("@babel/types");

(async () => {
  const code = process.argv.slice(2).join(" ");  // Join the arguments into a single string

  let functionsFound = [];  // Array to store the code of functions detected

  try {
    // Parse the input code into an AST
    const ast = parse(code, {
      sourceType: "module", // Support ES Modules
      plugins: [
        "typescript", // Enable TypeScript syntax
        "jsx",        // Support JSX (optional, for React)
      ],
    });

    // Traverse the AST and process nodes
    traverse(ast, {
      FunctionDeclaration(path) {
        // If a function declaration is found, extract and store its code
        const functionCode = code.slice(path.node.start, path.node.end);
        functionsFound.push(functionCode);
      },
      ArrowFunctionExpression(path) {
        // If an arrow function is found, extract and store its code
        const arrowFunctionCode = code.slice(path.node.start, path.node.end);
        functionsFound.push(arrowFunctionCode);
      },
    });

    // If any functions were found, output their code as JSON
    if (functionsFound.length > 0) {
      console.log(JSON.stringify(functionsFound)); // Return the function codes as JSON
    } else {
      console.log(JSON.stringify([])); // Return an empty array if no functions were found
    }
  } catch (err) {
    console.error("Error parsing the code:", err);
  }
})();
