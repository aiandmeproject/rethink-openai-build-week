# Rethink Concept

Rethink is a routed reasoning architecture for managing uncertainty over the life of a problem.

Its product-level unit is not the chat message. It is the reasoning cycle:

1. establish current project state;
2. find the unanswered question with the greatest downstream leverage;
3. select one method suited to that uncertainty;
4. execute the method with the evidence it requires;
5. challenge assumptions and update state;
6. preserve what changed in a notebook;
7. select a specific next action or disposition.

The design rejects two common failure patterns:

- **answer-first fluency**, where an AI gives a good answer to a low-leverage question;
- **framework theater**, where every method runs regardless of whether it fits the uncertainty.

PEC provides project location. STM provides reasoning priority. The router binds the priority to one operator. The notebook makes the evolution inspectable. Dispositions prevent generic endings. Human gates keep the runtime from hallucinating private, ethical, authorized, or real-world facts.

The Build Week prototype proves the smallest complete version of that loop in Guided Mode.
