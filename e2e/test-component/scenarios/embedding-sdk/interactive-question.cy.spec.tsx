import { useDisclosure } from "@mantine/hooks";
import {
  InteractiveQuestion,
  type MetabaseQuestion,
} from "@metabase/embedding-sdk-react";
import type { ComponentProps } from "react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  THIRD_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  createQuestion,
  describeEE,
  popover,
  tableHeaderClick,
  tableInteractive,
} from "e2e/support/helpers";
import {
  mockAuthProviderAndJwtSignIn,
  mountInteractiveQuestion,
  mountSdkContent,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/component-testing-sdk";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { saveInteractiveQuestionAsNewQuestion } from "e2e/support/helpers/e2e-embedding-sdk-interactive-question-helpers";
import { Box, Button, Modal } from "metabase/ui";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

type InteractiveQuestionProps = ComponentProps<typeof InteractiveQuestion>;

describeEE("scenarios > embedding-sdk > interactive-question", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    createQuestion({
      name: "47563",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
        breakout: [["field", ORDERS.PRODUCT_ID, null]],
        limit: 2,
      },
    }).then(({ body: question }) => {
      cy.wrap(question.id).as("questionId");
      cy.wrap(question.entity_id).as("questionEntityId");
    });

    cy.signOut();

    mockAuthProviderAndJwtSignIn();
  });

  it("should show question content", () => {
    mountInteractiveQuestion();

    getSdkRoot().within(() => {
      cy.findByText("Product ID").should("be.visible");
      cy.findByText("Max of Quantity").should("be.visible");
    });
  });

  it("should not fail on aggregated question drill", () => {
    mountInteractiveQuestion();

    cy.wait("@cardQuery").then(({ response }) => {
      expect(response?.statusCode).to.equal(202);
    });

    cy.findAllByTestId("cell-data").last().click();

    cy.on("uncaught:exception", error => {
      expect(
        error.message.includes(
          "Error converting :aggregation reference: no aggregation at index 0",
        ),
      ).to.be.false;
    });

    popover().findByText("See these Orders").click();

    cy.icon("warning").should("not.exist");
  });

  it("should be able to hide columns from a table", () => {
    mountInteractiveQuestion();

    cy.wait("@cardQuery").then(({ response }) => {
      expect(response?.statusCode).to.equal(202);
    });

    tableInteractive().findByText("Max of Quantity").should("be.visible");

    tableHeaderClick("Max of Quantity");

    popover()
      .findByTestId("click-actions-sort-control-formatting-hide")
      .click();

    tableInteractive().findByText("Max of Quantity").should("not.exist");
  });

  it("can save a question to a default collection", () => {
    mountInteractiveQuestion();

    saveInteractiveQuestionAsNewQuestion({
      entityName: "Orders",
      questionName: "Sample Orders 1",
    });

    cy.wait("@createCard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
      expect(response?.body.name).to.equal("Sample Orders 1");
      expect(response?.body.collection_id).to.equal(null);
    });
  });

  it("can save a question to a selected collection", () => {
    mountInteractiveQuestion();

    saveInteractiveQuestionAsNewQuestion({
      entityName: "Orders",
      questionName: "Sample Orders 2",
      collectionPickerPath: ["Our analytics", "First collection"],
    });

    cy.wait("@createCard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
      expect(response?.body.name).to.equal("Sample Orders 2");
      expect(response?.body.collection_id).to.equal(FIRST_COLLECTION_ID);
    });
  });

  it("can save a question to a pre-defined collection", () => {
    mountInteractiveQuestion({
      saveToCollectionId: Number(THIRD_COLLECTION_ID),
    });

    saveInteractiveQuestionAsNewQuestion({
      entityName: "Orders",
      questionName: "Sample Orders 3",
    });

    cy.wait("@createCard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
      expect(response?.body.name).to.equal("Sample Orders 3");
      expect(response?.body.collection_id).to.equal(THIRD_COLLECTION_ID);
    });
  });

  it("can add a filter via the FilterPicker component", () => {
    cy.intercept("GET", "/api/card/*").as("getCard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    const TestSuiteComponent = ({ questionId }: { questionId: string }) => (
      <Box p="lg">
        <InteractiveQuestion questionId={questionId}>
          <Box>
            <InteractiveQuestion.FilterDropdown />
            <InteractiveQuestion.QuestionVisualization />
          </Box>
        </InteractiveQuestion>
      </Box>
    );

    cy.get<string>("@questionId").then(questionId => {
      mountSdkContent(<TestSuiteComponent questionId={questionId} />);
    });

    cy.wait("@getCard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
    });

    getSdkRoot().findByText("Filter").click();

    popover().within(() => {
      cy.findByText("User ID").click();
      cy.findByPlaceholderText("Enter an ID").type("12");
      cy.findByText("Add filter").click();

      cy.findByText("User ID is 12").should("be.visible");
      cy.findByText("Add another filter").should("be.visible");
    });
  });

  it("can create questions via the SaveQuestionForm component", () => {
    const TestComponent = ({
      questionId,
      onBeforeSave,
      onSave,
    }: InteractiveQuestionProps) => {
      const [isSaveModalOpen, { toggle, close }] = useDisclosure(false);

      const handleSave = (
        question: MetabaseQuestion | undefined,
        context: { isNewQuestion: boolean },
      ) => {
        if (context.isNewQuestion) {
          onSave(question?.name ?? "");
        }

        close();
      };

      return (
        <InteractiveQuestion
          questionId={questionId}
          isSaveEnabled
          onBeforeSave={onBeforeSave}
          onSave={handleSave}
        >
          <Box p="lg">
            <Button onClick={toggle}>Save</Button>
          </Box>

          {isSaveModalOpen && (
            <Modal data-testid="modal" opened={isSaveModalOpen} onClose={close}>
              <InteractiveQuestion.SaveQuestionForm onCancel={close} />
            </Modal>
          )}

          {!isSaveModalOpen && <InteractiveQuestion.QuestionVisualization />}
        </InteractiveQuestion>
      );
    };

    const onBeforeSaveSpy = cy.spy().as("onBeforeSaveSpy");
    const onSaveSpy = cy.spy().as("onSaveSpy");

    cy.get("@questionId").then(questionId => {
      mountSdkContent(
        <TestComponent
          questionId={questionId}
          onBeforeSave={onBeforeSaveSpy}
          onSave={onSaveSpy}
        />,
      );
    });

    saveInteractiveQuestionAsNewQuestion({
      entityName: "Orders",
      questionName: "Sample Orders 4",
    });

    cy.wait("@createCard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
      expect(response?.body.name).to.equal("Sample Orders 4");
    });

    cy.get("@onBeforeSaveSpy").should("have.been.calledOnce");
    cy.get("@onSaveSpy").should("have.been.calledWith", "Sample Orders 4");
  });

  it("should not crash when clicking on Summarize (metabase#50398)", () => {
    mountInteractiveQuestion();

    cy.wait("@cardQuery").then(({ response }) => {
      expect(response?.statusCode).to.equal(202);
    });

    getSdkRoot().within(() => {
      // Open the default summarization view in the sdk
      cy.findByText("1 summary").click();
    });

    popover().findByText("Add another summary").click();

    // Expect the default summarization view to be there.
    cy.findByTestId("aggregation-picker").should("be.visible");

    cy.on("uncaught:exception", error => {
      expect(error.message.includes("Stage 1 does not exist")).to.be.false;
    });
  });

  describe("loading behavior for both entity IDs and number IDs (metabase#49581)", () => {
    const successTestCases = [
      {
        name: "correct entity ID",
        questionIdAlias: "@questionEntityId",
      },
      {
        name: "correct number ID",
        questionIdAlias: "@questionId",
      },
    ];

    const failureTestCases = [
      {
        name: "wrong entity ID",
        questionId: "VFCGVYPVtLzCtt4teeoW4",
      },
      {
        name: "one too many entity ID character",
        questionId: "VFCGVYPVtLzCtt4teeoW49",
      },
      {
        name: "wrong number ID",
        questionId: 9999,
      },
    ];

    successTestCases.forEach(({ name, questionIdAlias }) => {
      it(`should load question content for ${name}`, () => {
        cy.get(questionIdAlias).then(questionId => {
          mountInteractiveQuestion({ questionId });
        });

        getSdkRoot().within(() => {
          cy.findByText("Product ID").should("be.visible");
          cy.findByText("Max of Quantity").should("be.visible");
        });
      });
    });

    failureTestCases.forEach(({ name, questionId }) => {
      it(`should show an error message for ${name}`, () => {
        mountInteractiveQuestion(
          { questionId },
          { shouldAssertCardQuery: false },
        );

        getSdkRoot().within(() => {
          const expectedErrorMessage = `Question ${questionId} not found. Make sure you pass the correct ID.`;
          cy.findByRole("alert").should("have.text", expectedErrorMessage);
          cy.findByText("Product ID").should("not.exist");
          cy.findByText("Max of Quantity").should("not.exist");
        });
      });
    });
  });
});
